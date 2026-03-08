//======================//
//====CONFIGS SERVER====//
//======================//

//carrega as variaveis de seguranca do .env
require('dotenv').config();

//importando ferramentas
const express = require('express');
const cors = require('cors'); 
const {createClient} = require('@supabase/supabase-js');

//excel
const multer = require('multer');
const xlsx = require('xlsx');
const upload = multer({ dest: 'uploads/' });

//inicializa servidor
const app = express();
const porta = 3000;

app.use(cors({
    origin: urlFrontend,
    methods: ['GET', 'POST', 'PUT', 'DELETE']
}));
app.use(express.json());

//chaves do banco de dados
const supabase_url = process.env.SUPABASE_URL;
const supabase_key = process.env.SUPABASE_KEY;
const urlFrontend = process.env.FRONTEND_URL || '*';

//estabelecendo conexao com o supabase
const supabase = createClient(supabase_url, supabase_key);

app.get('/', (requisicao, resposta) => {
    resposta.send('O motor da Copa PES esta rodando');
});

//liga o servidor na porta definida
app.listen(porta, () => {
    console.log(`Servidor rodando! Acesse http://localhost:${porta}`)
});

//======================//
//==== PARTE LOGICA ====//
//======================//

//==== LISTAR TIMES E CLASSIFICACAO ====//
app.get('/TEAMS', async (requisicao, resposta) => {
    try {
        //pede ao banco todos os times, mas já ordenados: 
        const { data: classificacao, error } = await supabase.from('TEAMS').select('*').order('points', { ascending: false }).order('goals_score', { ascending: false });

        if (error) throw error;
        return resposta.status(200).json(classificacao);

    } catch (erro) {
        console.error("Erro ao puxar a classificação:", erro);
        return resposta.status(500).json({ 
            erro: "Falha ao carregar a tabela de times." 
        });
    }
});

//==== LISTAR TODAS AS PARTIDAS ====//
app.get('/GAMES', async (requisicao, resposta) => {
    try {
        //busca todos os jogos ordenados pela ordem de criação (match_id)
        const { data: jogos, error } = await supabase.from('GAMES').select('*').order('match_id', { ascending: true });

        if (error) throw error;

        return resposta.status(200).json(jogos);

    } catch (erro) {
        console.error("Erro ao puxar os jogos:", erro);
        return resposta.status(500).json({ 
            erro: "Falha interna ao tentar listar as partidas." 
        });
    }
});

//==== CADASTRAR NOVO JOGADOR ====//
app.post('/TEAMS', async (requisicao, resposta) => {
    try {
        const {name_player, team_player, color, ovr, formation} = requisicao.body;

        if (!name_player || !team_player) {
            return resposta.status(400).json({ erro: "Nome do jogador e da equipe são obrigatórios!" });
        }

        const { data: timeCadastrado, error: erroCadastro } = await supabase.from('TEAMS').insert([{
            name_player: name_player,
            team_player: team_player,
            color: color || "#FFFFFF", //cor padrao de nao for enviado
            ovr: ovr || 75,            //over padrao se nao for enviado
            formation: formation || "4-4-2", //formatacao padrao
            squad: [],
            points: 0,
            goals_score: 0,
            goals_conceded: 0, 
            matches_played: 0,
            wins: 0,
            draws: 0,
            losses: 0
        }]).select().single();    
        
        if (erroCadastro) throw erroCadastro;
        
        return resposta.status(201).json({
            mensagem: "Jogador cadastrado com todos os detalhes!",
            dados: timeCadastrado
        });

    } catch (erro) {
        console.error("Erro ao cadastrar:", erro);
        return resposta.status(500).json({ erro: "Falha ao registar o jogador." });
    }
});

//==== EDITAR JOGADOR E EQUIPE ====//
app.put('/TEAMS/:id', async (requisicao, resposta) => {
    try {
        const idJogador = requisicao.params.id;
        const dadosParaAtualizar = requisicao.body; //pega tudo que o front enviar

        //o bd atualiza so o que foi enviado
        const { data: jogadorAtualizado, error } = await supabase.from('TEAMS').update(dadosParaAtualizar).eq('id', idJogador).select().single();

        if (error) throw error;

        return resposta.status(200).json({
            mensagem: "Registo atualizado com sucesso!",
            dados: jogadorAtualizado
        });

    } catch (erro) {
        console.error("Erro ao editar jogador:", erro);
        return resposta.status(500).json({ erro: "Falha ao tentar editar as informações." });
    }
});

//==== REMOVER PLAYER ====//
app.delete('/TEAMS/:id', async (requisicao, resposta) => {
    try {
        const idJogador = requisicao.params.id;
        const { error } = await supabase.from('TEAMS').delete().eq('id', idJogador);

        if (error) throw error;
        return resposta.status(200).json({
            mensagem: `O jogador com o ID ${idJogador} foi eliminado da competição.`
        });

    } catch (erro) {
        console.error("Erro ao eliminar jogador:", erro);
        return resposta.status(500).json({ erro: "Falha ao tentar eliminar o jogador." });
    }
});

//==== PONTOS CORRIDOS ====//
app.post('/GAMES/GERAR', async (requisicao, resposta) => {
    try {
        const formato = requisicao.body.formato || "single";
        
        //limpa jogos antigos
        await supabase.from('GAMES').delete().neq('match_id', 0);

        //pega todos os times válidos
        const { data: times } = await supabase.from('TEAMS').select('*').neq('team_player', 'Sem Time');
        
        if (!times || times.length < 2) return resposta.status(400).json({ erro: "Times insuficientes." });

        //gera a tabela dividida por rodadas
        let partidas = gerarTabelaRoundRobin(times);

        //se for Ida e Volta, clona a tabela invertendo os mandos
        if (formato === "homeaway") {
            const maxRodada = Math.max(...partidas.map(p => p.round));
            const partidasVolta = partidas.map(p => ({
                ...p,
                team_house_id: p.team_out_id,
                team_out_id: p.team_house_id,
                round: p.round + maxRodada
            }));
            partidas = partidas.concat(partidasVolta);
        }

        const { error } = await supabase.from('GAMES').insert(partidas);
        if (error) throw error;

        return resposta.status(201).json({ mensagem: "Liga gerada com sucesso!" });
    } catch (erro) {
        console.error("Erro ao gerar liga:", erro);
        return resposta.status(500).json({ erro: "Erro interno." });
    }
});

//==== MATA-MATA ====//
app.post('/GAMES/MATA-MATA', async (requisicao, resposta) => {
    try {
        //recebe do front se e jogo unicou ou ida e volta
        const formato = requisicao.body.formato || "single"; 

        //pega os times ja classificados ordenados do 1º ao último
        const { data: times, error: erroTimes } = await supabase.from('TEAMS').select('id, name_player').order('points', { ascending: false }).order('goals_score', { ascending: false });

        if (erroTimes) throw erroTimes;
        const totalTimes = times.length;
        if (totalTimes < 2) {
            return resposta.status(400).json({ 
                erro: "É preciso pelo menos 2 jogadores para fazer um mata-mata!" 
            });
        }

        //logiga para descobrir o tamno ideal da chave
        let tamanhoChave = 2;
        while (tamanhoChave < totalTimes) {
            tamanhoChave *= 2;
        }

        //logica da repescaem
        const timesrepescagem = tamanhoChave - totalTimes; 
        const partidasParaSalvar = [];
        const identificadorFase = 99; //so pra identificar diferente

        //monta confronts
        let indiceMelhor = timesrepescagem; 
        let indicePior = totalTimes - 1; 

        while (indiceMelhor < indicePior) {
            //jogo de ida
            partidasParaSalvar.push({
                team_house_id: times[indicePior].id,
                team_out_id: times[indiceMelhor].id,
                goals_home: 0,
                goals_out: 0,
                status_game: "Pendente",
                round: identificadorFase 
            });

            //jogo de volta se for o formato homeaway
            if (formato === "homeaway") {
                partidasParaSalvar.push({
                    team_house_id: times[indiceMelhor].id, 
                    team_out_id: times[indicePior].id,     
                    goals_home: 0,
                    goals_out: 0,
                    status_game: "Pendente",
                    round: identificadorFase 
                });
            }

            indiceMelhor++; 
            indicePior--;   
        }

        //salva confrontos no bacno
        const { error: erroInsert } = await supabase.from('GAMES').insert(partidasParaSalvar);

        if (erroInsert) throw erroInsert;
        let mensagem = `Mata-mata (${formato === "homeaway" ? "Ida e Volta" : "Jogo Único"}) gerado com ${partidasParaSalvar.length} partidas!`;

        return resposta.status(201).json({
            mensagem: mensagem,
            jogos_criados: partidasParaSalvar.length
        });

    } catch (erro) {
        console.error("Erro ao gerar mata-mata:", erro);
        return resposta.status(500).json({ 
            erro: "Falha interna ao tentar criar a árvore do mata-mata." 
        });
    }   
});

//==== SORTEIO DOS TIMES ====//
app.post('/TEAMS/SORTEIO', async (requisicao, resposta) => {
    try {
        //recebe do front as duas listas
        const listaJogadores = requisicao.body.jogadores;
        const listaTimes = requisicao.body.times;

        //valida a lisrta
        if (!listaJogadores || !listaTimes || listaJogadores.length === 0 || listaTimes.length === 0) {
            return resposta.status(400).json({
                erro: "É necessário enviar uma lista de jogadores e uma lista de times para o sorteio!"
            });
        }

        //embaralha os times
        const timesEmbaralhados = [...listaTimes];
        for (let i = timesEmbaralhados.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            // troca as posicoes
            [timesEmbaralhados[i], timesEmbaralhados[j]] = [timesEmbaralhados[j], timesEmbaralhados[i]];
        }

        //combina os jogaroes com os novos times
        const novosCadastros = listaJogadores.map((nomeJogador, index) => {
            return {
                name_player: nomeJogador,
                team_player: timesEmbaralhados[index % timesEmbaralhados.length],
                points: 0,
                goals_score: 0,
                goals_conceded: 0, 
                matches_played: 0, 
                wins: 0, 
                draws: 0, 
                losses: 0
            };
        });

        //salva tudo no banco de dados
        const { data: timesCadastrados, error: erroCadastro } = await supabase.from('TEAMS').insert(novosCadastros).select();

        if (erroCadastro) throw erroCadastro;

        return resposta.status(201).json({
            mensagem: `Sorteio realizado! ${novosCadastros.length} jogadores foram definidos e cadastrados.`,
            resultado: timesCadastrados
        });

    } catch (erro) {
        console.error("Erro ao realizar o sorteio:", erro);
        return resposta.status(500).json({ 
            erro: "Falha interna ao tentar sortear e cadastrar os times." 
        });
    }   
});

//==== FILTROS ====//
app.get('/GAMES/FILTRO', async (requisicao, resposta) => {
    try {
        //pega o filtro da url
        const{rodada, status} = requisicao.query; 

        let consulta = supabase.from('GAMES').select('*');

        //se passa uam rodada, filtra por ela
        if (rodada) {
            consulta = consulta.eq('round', Number(rodada));
        }
        //se passa um status filtra por ele
        if (status) {
            consulta = consulta.eq('status_game', status);
        }

        const { data: jogos, error } = await consulta.order('match_id', { ascending: true });

        if (error) throw error;

        return resposta.status(200).json(jogos);

    } catch (erro) {
        console.error("Erro ao filtrar jogos:", erro);
        return resposta.status(500).json({ erro: "Erro ao buscar partidas filtradas." });
    }
});

//==== RESETAR CAMPEONATO ====//
app.delete('/GAMES/RESET',  async(requisicao, resposta) =>{
    try{
        //neq e pra dizer ao banco de dados para apagar tudo que nao seja 0
        const {error: erroDelete} = await supabase.from('GAMES').delete().neq('match_id', 0); 

        if (errorDelete) throw errorDelete;
    
        //usamos o UPDATE para manter os jogadores vivos no sistema, mas limpando o time usado
        const { error: erroUpdate } = await supabase.from('TEAMS').update({ 
            team_player: "Sem Time", 
            squad: [], 
            points: 0, 
            goals_score: 0, 
            goals_conceded: 0, 
            matches_played: 0, 
            wins: 0, 
            draws: 0, 
            losses: 0, 
            grupo: null
        }).neq('id', 0);

        if (erroUpdate) throw erroUpdate;
        return resposta.status(200).json({mensagem: "Campeonato resetado com sucesso! Tabela de jogos apagada e times limpos, mas jogadores mantidos."});

    } catch (erro) {
        console.error("Erro ao resetar o campeonato:", erro);
        return resposta.status(500).json({ 
            erro: "Falha interna ao tentar limpar o banco de dados." 
        });
    }
});

//==== ATUALIZAR PARTIDAS E CLASSIFICACAO ====//
app.put('/GAMES/:id', async(requisicao, resposta) =>{
    try {
        const idPartida = requisicao.params.id;
        
        //reequisita do front gols e o status do jogo
        const golsCasaNovo = requisicao.body.goals_home;
        const golsForaNovo = requisicao.body.goals_out;
        const statusDesejado = requisicao.body.status_game; 

        //busca a partida atual
        const { data: partidaAntiga } = await supabase.from('GAMES').select('*').eq('match_id', Number(idPartida)).maybeSingle();

        if (!partidaAntiga) return resposta.status(404).json({ erro: "Partida não encontrada." });
        const statusAntigo = partidaAntiga.status_game;
        const idCasa = partidaAntiga.team_house_id;
        const idFora = partidaAntiga.team_out_id;

        //salva o novo placar
        const {data: jogoAtualizado, error: erroJogo} = await supabase.from('GAMES').update({ goals_home: golsCasaNovo, goals_out: golsForaNovo, status_game: statusDesejado }).eq('match_id', Number(idPartida)).select().single();

        if(erroJogo) throw erroJogo;

        //se o jogo esta ao vivo termina aqui
        if (statusDesejado === "Ao Vivo") {
            return resposta.json({ mensagem: `Partida Ao Vivo! Placar atual: ${golsCasaNovo}x${golsForaNovo}.` });
        }

        //logica matematica caso o jogo esteja finalizado
        if (statusDesejado === "Finalizado") {
            
            //se for uma correcao de placar, usamos essas variaveis
            let dPtsC = 0, dPtsF = 0;
            let dVitC = 0, dVitF = 0, dEmpC = 0, dEmpF = 0, dDerC = 0, dDerF = 0;
            let dGpC = 0, dGpF = 0, dGcC = 0, dGcF = 0;
            let dPartidas = statusAntigo !== "Finalizado" ? 1 : 0; 

            //se estrava finalizado verificamos o que precisa ser atualizado (desfaz o passado)
            if (statusAntigo === "Finalizado") {
                const gcV = partidaAntiga.goals_home; const gfV = partidaAntiga.goals_out;
                if (gcV > gfV) { dPtsC -= 3; dVitC -= 1; dDerF -= 1; }
                else if (gcV < gfV) { dPtsF -= 3; dVitF -= 1; dDerC -= 1; }
                else { dPtsC -= 1; dPtsF -= 1; dEmpC -= 1; dEmpF -= 1; }
                
                dGpC -= gcV; dGcC -= gfV; 
                dGpF -= gfV; dGcF -= gcV; 
            }

            //calculo com o placar correto
            if (golsCasaNovo > golsForaNovo) { dPtsC += 3; dVitC += 1; dDerF += 1; }
            else if (golsCasaNovo < golsForaNovo) { dPtsF += 3; dVitF += 1; dDerC += 1; }
            else { dPtsC += 1; dPtsF += 1; dEmpC += 1; dEmpF += 1; }
            
            dGpC += golsCasaNovo; dGcC += golsForaNovo;
            dGpF += golsForaNovo; dGcF += golsCasaNovo;

            //busca os pontos totais
            const {data: tCasa} = await supabase.from('TEAMS').select('*').eq('id', idCasa).single();
            const {data: tFora} = await supabase.from('TEAMS').select('*').eq('id', idFora).single();

            //aplica a variacao no bd
            await supabase.from('TEAMS').update({
                points: tCasa.points + dPtsC, wins: tCasa.wins + dVitC, draws: tCasa.draws + dEmpC, losses: tCasa.losses + dDerC,
                goals_score: tCasa.goals_score + dGpC, goals_conceded: tCasa.goals_conceded + dGcC, matches_played: tCasa.matches_played + dPartidas
            }).eq('id', idCasa);

            await supabase.from('TEAMS').update({
                points: tFora.points + dPtsF, wins: tFora.wins + dVitF, draws: tFora.draws + dEmpF, losses: tFora.losses + dDerF,
                goals_score: tFora.goals_score + dGpF, goals_conceded: tFora.goals_conceded + dGcF, matches_played: tFora.matches_played + dPartidas
            }).eq('id', idFora);

            let aviso = statusAntigo === "Finalizado" ? "Placar corrigido com sucesso!" : "Apito Final!";
            return resposta.json({ mensagem: `${aviso} Classificação atualizada para ${golsCasaNovo}x${golsForaNovo}.` });
        }

    } catch (erro) {
        console.error("Erro ao atualizar o jogo:", erro);
        return resposta.status(500).json({ erro: "Falha ao tentar atualizar ou corrigir o placar." });
    }
});

//==== FINALIZAR COPA ====//
app.post('/COPAS/FINALIZAR', async (requisicao, resposta) => {
    try {
        //pega o nome dado ou cria um automatico
        const nomeDaCopa = requisicao.body.nome_copa || `Copa PES ${new Date().getFullYear()}`;
        const nomeCampeao = requisicao.body.campeao || "Não definido"; // CORREÇÃO: Recebe o campeão oficial
        
        //salva a tabela de classificacao
        const { data: classificacao, error: erroClassificacao } = await supabase.from('TEAMS').select('*').order('points', { ascending: false }).order('goals_score', { ascending: false });
        
        //salva as chaves
        const { data: partidasHistoricas } = await supabase.from('GAMES').select('*').order('match_id', { ascending: true }); 

        if (erroClassificacao) throw erroClassificacao;

        if (!classificacao || classificacao.length === 0) {
            return resposta.status(400).json({ erro: "Não há times cadastrados para arquivar." });
        }

        //guarda a tabela no bd
        const { data: copaSalva, error: erroCopa } = await supabase.from('CUPS')
            .insert([{
                nome_copa: nomeDaCopa,
                campeao: nomeCampeao,
                classificacao_final: classificacao, 
                jogos_historico: partidasHistoricas
            }]).select().single();

        if (erroCopa) throw erroCopa;

        //apaga os jogos atuais, MAS apenas ATUALIZA os jogadores em vez de deletá-los
        await supabase.from('GAMES').delete().neq('match_id', 0);
        await supabase.from('TEAMS').update({ 
            team_player: "Sem Time", 
            squad: [], 
            points: 0, 
            goals_score: 0, 
            goals_conceded: 0, 
            matches_played: 0, 
            wins: 0, 
            draws: 0, 
            losses: 0,
            grupo: null
        }).neq('id', 0);

        return resposta.status(201).json({
            mensagem: `🏆 ${nomeDaCopa} finalizada com sucesso! O histórico foi salvo e os jogadores estão prontos para a próxima edição.`,
            copa: copaSalva
        });

    } catch (erro) {
        console.error("Erro ao arquivar a copa:", erro);
        return resposta.status(500).json({ erro: "Falha interna ao tentar salvar o histórico da Copa." });
    }
});

//==== LISTAR COPAS ====//
app.get('/COPAS', async (requisicao, resposta) => {
    try {
        //busca os dados de copas passadas na tabela CUPS
        const { data: copas, error } = await supabase.from('CUPS').select('*').order('created_at', { ascending: false });

        if (error) throw error;
        return resposta.status(200).json(copas);

    } catch (erro) {
        console.error("Erro ao buscar histórico:", erro);
        return resposta.status(500).json({ erro: "Falha ao carregar o histórico de copas." });
    }
});

//==== IMPORTAR HISTORICO ====//
app.post('/COPAS/IMPORTAR', upload.single('arquivo'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ erro: "Nenhum arquivo enviado." });
        
        const workbook = xlsx.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

        const copasMap = new Map();
        
        data.forEach(row => {
            const nome_copa = String(row.nome_copa || "").trim();
            if (!nome_copa) return;

            if (!copasMap.has(nome_copa)) {
                copasMap.set(nome_copa, {
                    nome_copa: nome_copa,
                    campeao: String(row.campeao || "").trim(),
                    classificacao_final: []
                });
            }
            
            copasMap.get(nome_copa).classificacao_final.push({
                name_player: String(row.name_player || "").trim(),
                team_player: String(row.team_player || "").trim(),
                points: Number(row.points) || 0,
                wins: Number(row.wins) || 0,
                draws: Number(row.draws) || 0,
                losses: Number(row.losses) || 0,
                goals_score: Number(row.goals_score) || 0,
                goals_conceded: Number(row.goals_conceded) || 0
            });
        });

        const copasParaInserir = Array.from(copasMap.values());
        const { error } = await supabase.from('CUPS').insert(copasParaInserir);
        
        if (error) throw error;
        res.status(200).json({ mensagem: "Colunas importadas com sucesso!" });

    } catch (error) {
        console.error("Erro na importação:", error);
        res.status(500).json({ erro: "Erro ao ler as colunas do Excel." });
    }
});

//==== EXPORTAR HISTORICO ====//
app.get('/COPAS/EXPORTAR', async (req, res) => {
    try {
        const { data: copas, error } = await supabase.from('CUPS').select('*').order('created_at', { ascending: false });
        if (error) throw error;

        const linhasExcel = [];

        copas.forEach(cup => {
            if (cup.classificacao_final) {
                cup.classificacao_final.forEach(stat => {
                    linhasExcel.push({
                        "nome_copa": cup.nome_copa,
                        "campeao": cup.campeao,
                        "name_player": stat.name_player,
                        "team_player": stat.team_player,
                        "points": stat.points || 0,
                        "wins": stat.wins || 0,
                        "draws": stat.draws || 0,
                        "losses": stat.losses || 0,
                        "goals_score": stat.goals_score || 0,
                        "goals_conceded": stat.goals_conceded || 0
                    });
                });
            }
        });

        const worksheet = xlsx.utils.json_to_sheet(linhasExcel);
        const workbook = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(workbook, worksheet, "Historico");
        const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        
        res.setHeader('Content-Disposition', 'attachment; filename="Historico_Copa_PES.xlsx"');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);

    } catch (error) {
        console.error("Erro na exportação:", error);
        res.status(500).json({ erro: "Falha ao gerar colunas do Excel." });
    }
});

//==== RANKING GERAL ====//
app.get('/RANKING-GERAL', async (requisicao, resposta) => {
    try {
        const { data: copas, error } = await supabase.from('CUPS').select('*');
        if (error) throw error;

        const ranking = {};

        copas.forEach(copa => {
            if (copa.classificacao_final) {
                copa.classificacao_final.forEach(jogador => {
                    const nome = jogador.name_player;
                    if (!ranking[nome]) ranking[nome] = { nome: nome, pontosTotais: 0, titulos: 0, participacoes: 0 };
                    
                    ranking[nome].pontosTotais += jogador.points || 0;
                    ranking[nome].participacoes += 1;
                });
            }
            if (copa.campeao && ranking[copa.campeao]) ranking[copa.campeao].titulos += 1;
        });

        const rankingFinal = Object.values(ranking).sort((a, b) => {
            if (b.titulos !== a.titulos) return b.titulos - a.titulos;
            return b.pontosTotais - a.pontosTotais;
        });

        return resposta.status(200).json(rankingFinal);
    } catch (erro) {
        return resposta.status(500).json({ erro: "Falha no Hall da Fama." });
    }
});

//==== DELETER/EDITAR INFOS ====//
app.put('/COPAS/:id', async (requisicao, resposta) => {
    try {
        const idCopa = requisicao.params.id;
        const dadosParaAtualizar = requisicao.body; 
        const { data: copaAtualizada, error } = await supabase.from('CUPS').update(dadosParaAtualizar).eq('id', idCopa).select().single();
        if (error) throw error;
        return resposta.status(200).json({ mensagem: "Histórico atualizado!", copa: copaAtualizada });
    } catch (erro) {
        return resposta.status(500).json({ erro: "Erro ao editar copa." });
    }
});

app.delete('/COPAS/:id', async (requisicao, resposta) => {
    try {
        const idCopa = requisicao.params.id;
        const { error } = await supabase.from('CUPS').delete().eq('id', idCopa);
        if (error) throw error;
        return resposta.status(200).json({ mensagem: `Copa ID ${idCopa} apagada.` });
    } catch (erro) {
        return resposta.status(500).json({ erro: "Erro ao apagar copa." });
    }
});

//==== GERAR FASE DE GRUPOS ====//
app.post('/GAMES/GERAR-GRUPOS', async (requisicao, resposta) => {
    try {
        const numGrupos = Number(requisicao.body.numGrupos) || 2;
        const formato = requisicao.body.formato || "single";
        await supabase.from('GAMES').delete().neq('match_id', 0);
        const { data: times, error: erroTimes } = await supabase.from('TEAMS').select('*').neq('team_player', 'Sem Time');
        if (erroTimes) throw erroTimes;
        if (!times || times.length < numGrupos) return resposta.status(400).json({ erro: "Times insuficientes." });
        const shuffled = [...times].sort(() => Math.random() - 0.5);
        const nomesGrupos = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
        const timesComGrupo = [];
        for (let i = 0; i < shuffled.length; i++) {
            const grupoIndex = i % numGrupos;
            timesComGrupo.push({ ...shuffled[i], grupo: nomesGrupos[grupoIndex] });
        }
        for (const t of timesComGrupo) await supabase.from('TEAMS').update({ grupo: t.grupo }).eq('id', t.id);
        let todasPartidas = [];
        for (let g = 0; g < numGrupos; g++) {
            const letra = nomesGrupos[g];
            const timesDoGrupo = timesComGrupo.filter(t => t.grupo === letra);
            const partidasDoGrupo = gerarTabelaRoundRobin(timesDoGrupo);
            todasPartidas.push(...partidasDoGrupo);
        }
        if (formato === "homeaway") {
            const maxRodada = Math.max(...todasPartidas.map(p => p.round));
            const partidasVolta = todasPartidas.map(p => ({
                ...p, team_house_id: p.team_out_id, team_out_id: p.team_house_id, round: p.round + maxRodada
            }));
            todasPartidas = todasPartidas.concat(partidasVolta);
        }
        const { error: erroInsert } = await supabase.from('GAMES').insert(todasPartidas);
        if (erroInsert) throw erroInsert;
        return resposta.status(201).json({ mensagem: "Fase de grupos gerada!" });
    } catch (erro) {
        console.error("Erro ao gerar grupos:", erro);
        return resposta.status(500).json({ erro: "Falha interna ao gerar fase de grupos." });
    }
});

// --- FUNÇÃO MATEMÁTICA PARA GERAR RODADAS ROUND-ROBIN ---
function gerarTabelaRoundRobin(timesValidos) {
    const times = [...timesValidos];
    if (times.length % 2 !== 0) {
        times.push({ id: null, byes: true }); 
    }
    const totalRodadas = times.length - 1;
    const jogosPorRodada = times.length / 2;
    let partidas = [];
    for (let r = 0; r < totalRodadas; r++) {
        for (let i = 0; i < jogosPorRodada; i++) {
            const casa = times[i];
            const fora = times[times.length - 1 - i];
            if (casa.id !== null && fora.id !== null) {
                partidas.push({
                    team_house_id: casa.id,
                    team_out_id: fora.id,
                    goals_home: 0,
                    goals_out: 0,
                    status_game: "Pendente",
                    round: r + 1 
                });
            }
        }
        times.splice(1, 0, times.pop());
    }
    return partidas;
}