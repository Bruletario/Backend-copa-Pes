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
const upload = multer({ storage: multer.memoryStorage() });

//inicializa servidor
const app = express();
const porta = 3000;

//importar excel
const xlsx = require('xlsx');

app.use(cors());
app.use(express.json());

//chaves do banco de dados
const supabase_url = process.env.SUPABASE_URL;
const supabase_key = process.env.SUPABASE_KEY;

//estabelecendo conexao com o supabase
const supabase = createClient(supabase_url, supabase_key);

app.get('/', (requisicao, resposta) => {
    resposta.send('O motor da Copa PES esta rodando');
});

//Liga o servidor na porta definida
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

//==== GERAR CAMPEONATO TODOS CONTRA TODOS ====//
app.post('/GAMES/GERAR', async (requisicao, resposta) =>{
    try {
        //suporta ida e volta
        const formato = requisicao.body.formato || "single"; 

        //busca todos os times que estao cadastrados
        const { data: times, error: erroTimes } = await supabase.from('TEAMS').select('id, name_player');
        if (erroTimes) throw erroTimes;

        //precisa de pelo menos 2 pessoas para ter torneio
        if (!times || times.length < 2) {
            return resposta.status(400).json({ 
                erro: "É preciso cadastrar pelo menos 2 jogadores para gerar os jogos!" 
            });
        }

        //todos contra todos - apenas ida
        const partidasParaSalvar = [];
        let rodadaAtual = 1;
        for (let i = 0; i < times.length; i++) {
            for (let j = i + 1; j < times.length; j++) {
                partidasParaSalvar.push({
                    team_house_id: times[i].id,
                    team_out_id: times[j].id,
                    goals_home: 0,
                    goals_out: 0,
                    status_game: "Pendente",
                    round: rodadaAtual
                });
                rodadaAtual++;
            }
        }

        //returno
        if (formato === "homeaway") {
            const totalJogosIda = partidasParaSalvar.length;
            for (let k = 0; k < totalJogosIda; k++) {
                const jogoIda = partidasParaSalvar[k];
                partidasParaSalvar.push({
                    team_house_id: jogoIda.team_out_id, 
                    team_out_id: jogoIda.team_house_id, 
                    goals_home: 0,
                    goals_out: 0,
                    status_game: "Pendente",
                    round: rodadaAtual
                });
                rodadaAtual++;
            }
        }

        //salva todos os confrontos na tabela games
        const { error: erroInsert } = await supabase
            .from('GAMES')
            .insert(partidasParaSalvar);

        if (erroInsert) throw erroInsert;

        return resposta.status(201).json({
            mensagem: `Sucesso! O calendário foi gerado com ${partidasParaSalvar.length} partida!`,
            total_jogos: partidasParaSalvar.length
        });

    } catch (erro) {
        console.error("Erro ao gerar campeonato:", erro);
        return resposta.status(500).json({ 
            erro: "Falha interna ao tentar gerar as rodadas." 
        });
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

        if (erroDelete) throw erroDelete;
    
        //zera pontos e gols na tabela times (CORREÇÃO: zerando também V, E, D, GC)
        const { error: erroUpdate } = await supabase.from('TEAMS').update({ 
            points: 0, goals_score: 0, goals_conceded: 0, matches_played: 0, wins: 0, draws: 0, losses: 0 
        }).neq('id', 0);

        if (erroUpdate) throw erroUpdate;
        return resposta.status(200).json({mensagem: "Campeonato resetado com sucesso! Tabela de jogos apagada e pontuações zeradas."});

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

        //apaga os jogos e zera pontuacao
        await supabase.from('GAMES').delete().neq('match_id', 0);
        await supabase.from('TEAMS').update({ 
            points: 0, goals_score: 0, goals_conceded: 0, matches_played: 0, wins: 0, draws: 0, losses: 0 
        }).neq('id', 0);

        return resposta.status(201).json({
            mensagem: `🏆 ${nomeDaCopa} finalizada com sucesso! O histórico foi salvo e o campo está limpo para a próxima.`,
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
        //busca os dados de copas passadas
        const { data: copas, error } = await supabase.from('CUPS').select('*').order('created_at', { ascending: false });

        if (error) throw error;
        return resposta.status(200).json(copas);

    } catch (erro) {
        console.error("Erro ao buscar histórico:", erro);
        return resposta.status(500).json({ erro: "Falha ao carregar o histórico de copas." });
    }
});

//==== EXPORTAR COPA ====//
app.get('/COPAS/EXPORTAR', async (requisicao, resposta) => {
    try {
        //busca todo o historico de copas
        const { data: copas, error } = await supabase.from('CUPS').select('*').order('created_at', { ascending: false });

        if (error) throw error;
        if (!copas || copas.length === 0) {
            return resposta.status(404).json({ erro: "Nenhuma Copa encontrada para exportar." });
        }

        //prepara os dados
        const dadosParaExcel = copas.map(copa => {
            
            //campeao e o primeiro (CORREÇÃO: Agora usa a coluna oficial do campeão)
            return {
                "Nome do Torneio": copa.nome_copa,
                "Data de Encerramento": new Date(copa.created_at).toLocaleDateString('pt-BR'),
                "Campeão": copa.campeao || "N/A" 
            };
        });

        //monta estrutura do excel
        const planilha = xlsx.utils.json_to_sheet(dadosParaExcel); //folha
        const arquivoExcel = xlsx.utils.book_new();               //arquivo
        xlsx.utils.book_append_sheet(arquivoExcel, planilha, "Histórico dos Campeões"); //junta tudo

        //converte excel para buffer
        const buffer = xlsx.write(arquivoExcel, { type: 'buffer', bookType: 'xlsx' });

        //avisa o navegador que e um arquivo para download
        resposta.setHeader('Content-Disposition', 'attachment; filename="historico_copas_pes.xlsx"');
        resposta.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        
        return resposta.send(buffer);

    } catch (erro) {
        console.error("Erro ao exportar Excel:", erro);
        return resposta.status(500).json({ erro: "Falha ao gerar o ficheiro Excel." });
    }
});

//==== IMPORTAR HISTORICO ====//
app.post('/COPAS/IMPORTAR', upload.single('planilha'), async (requisicao, resposta) => {
    try {
        if (!requisicao.file) {
            return resposta.status(400).json({ erro: "Nenhum arquivo Excel foi enviado!" });
        }

        //le o arquivo da memoria
        const workbook = xlsx.read(requisicao.file.buffer, { type: 'buffer' });
        const nomePrimeiraAba = workbook.SheetNames[0];
        const aba = workbook.Sheets[nomePrimeiraAba];

        //converte excel para json
        const dadosExcel = xlsx.utils.sheet_to_json(aba);

        if (dadosExcel.length === 0) {
            return resposta.status(400).json({ erro: "A planilha está vazia!" });
        }

        //objeto de dados
        const nomeCopa = dadosExcel[0]["Nome do Torneio"] || `Copa Importada - ${new Date().getFullYear()}`;
        const campeaoImportado = dadosExcel[0]["Campeão"] || "N/A"; // CORREÇÃO: Lê o campeão da planilha

        //salva tudo na coluna classificacao final
        const { data: copaImportada, error: erroInsert } = await supabase
            .from('CUPS')
            .insert([{
                nome_copa: nomeCopa,
                campeao: campeaoImportado, // CORREÇÃO: Salva o campeão importado
                classificacao_final: dadosExcel 
            }])
            .select()
            .single();

        if (erroInsert) throw erroInsert;

        return resposta.status(201).json({
            mensagem: "Histórico importado e salvo com sucesso!",
            copa: copaImportada
        });

    } catch (erro) {
        console.error("Erro ao importar o Excel:", erro);
        return resposta.status(500).json({ erro: "Falha ao processar o arquivo de importação." });
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
        const dadosParaAtualizar = requisicao.body; //pode ser o nome_copa ou a classificacao_final corrigida

        const { data: copaAtualizada, error } = await supabase.from('CUPS').update(dadosParaAtualizar).eq('id', idCopa).select().single();

        if (error) throw error;

        return resposta.status(200).json({
            mensagem: "Histórico da Copa atualizado com sucesso!",
            copa: copaAtualizada
        });

    } catch (erro) {
        console.error("Erro ao editar copa:", erro);
        return resposta.status(500).json({ erro: "Falha ao tentar editar o histórico." });
    }
});

app.delete('/COPAS/:id', async (requisicao, resposta) => {
    try {
        const idCopa = requisicao.params.id;

        const { error } = await supabase.from('CUPS').delete().eq('id', idCopa);
        if (error) throw error;

        return resposta.status(200).json({
            mensagem: `O histórico da Copa ID ${idCopa} foi apagado permanentemente.`
        });

    } catch (erro) {
        console.error("Erro ao deletar copa:", erro);
        return resposta.status(500).json({ erro: "Falha ao tentar apagar o histórico." });
    }
});