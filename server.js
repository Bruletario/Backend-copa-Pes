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

// 1º: PUXA AS VARIÁVEIS PRIMEIRO
const supabase_url = process.env.SUPABASE_URL;
const supabase_key = process.env.SUPABASE_KEY;
const urlFrontend = process.env.FRONTEND_URL || '*';

// 2º: USA AS VARIÁVEIS NO CORS DEPOIS
app.use(cors({
    origin: urlFrontend,
    methods: ['GET', 'POST', 'PUT', 'DELETE']
}));
app.use(express.json());

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

//==== CONFIGURACOES GLOBAIS DA COPA ====//
app.get('/CONFIGS', async (requisicao, resposta) => {
    try {
        const { data, error } = await supabase.from('CONFIGS').select('dados').eq('id', 1).single();
        if (error) throw error;
        return resposta.status(200).json(data.dados);
    } catch (erro) {
        console.error("Erro ao buscar configs:", erro);
        return resposta.status(500).json({ erro: "Falha ao carregar configs globais." });
    }
});

app.put('/CONFIGS', async (requisicao, resposta) => {
    try {
        const { error } = await supabase.from('CONFIGS').update({ dados: requisicao.body }).eq('id', 1);
        if (error) throw error;
        return resposta.status(200).json({ mensagem: "Configurações sincronizadas na nuvem!" });
    } catch (erro) {
        console.error("Erro ao atualizar configs:", erro);
        return resposta.status(500).json({ erro: "Falha ao atualizar configs." });
    }
});

//==== NOVO: LISTAR TODOS OS JOGADORES (INCLUINDO INATIVOS PARA O HISTÓRICO) ====//
app.get('/TEAMS/ALL', async (requisicao, resposta) => {
    try {
        const { data, error } = await supabase.from('TEAMS').select('id, name_player, team_player');
        if (error) throw error;
        return resposta.status(200).json(data);
    } catch (erro) {
        return resposta.status(500).json({ erro: "Falha ao carregar o banco geral de jogadores." });
    }
});

//==== LISTAR JOGADORES COM HISTÓRICO GERAL (CORRIGIDO: APENAS ATIVOS NA TELA PRINCIPAL) ====//
app.get('/PLAYERS/ALL-TIME', async (requisicao, resposta) => {
    try {
        // 1. Pega os jogadores ATIVOS cadastrados
        const { data: timesAtual, error: errTeams } = await supabase.from('TEAMS').select('*').neq('team_player', 'INATIVO');
        if (errTeams) throw errTeams;

        // 2. Pega o histórico de copas para cruzar os dados
        const { data: copas, error: errCups } = await supabase.from('CUPS').select('*');
        if (errCups) throw errCups;

        // 3. Mapa unificado apenas para os jogadores ATIVOS
        const mapaJogadores = new Map();

        timesAtual.forEach(t => {
            mapaJogadores.set(t.name_player, {
                ...t,
                ouro: 0, prata: 0, bronze: 0,
                all_time_matches: t.matches_played || 0,
                all_time_goals: t.goals_score || 0,
                all_time_goals_conceded: t.goals_conceded || 0,
                all_time_wins: t.wins || 0,
                all_time_draws: t.draws || 0,
                all_time_losses: t.losses || 0
            });
        });

        // Processa o histórico de todas as copas
        copas.forEach(copa => {
            const classificacao = copa.classificacao_final || [];
            
            const campeao = copa.campeao;
            let vice = null;
            let terceiro = null;

            const sorted = [...classificacao].sort((a,b) => b.points - a.points);
            const semCampeao = sorted.filter(p => p.name_player !== campeao);
            
            if (semCampeao.length > 0) vice = semCampeao[0].name_player;
            if (semCampeao.length > 1) terceiro = semCampeao[1].name_player;

            classificacao.forEach(stat => {
                const nome = stat.name_player;
                
                if (mapaJogadores.has(nome)) {
                    const j = mapaJogadores.get(nome);
                    j.all_time_matches += (stat.matches_played || 0);
                    j.all_time_goals += (stat.goals_score || 0);
                    j.all_time_goals_conceded += (stat.goals_conceded || 0);
                    j.all_time_wins += (stat.wins || 0);
                    j.all_time_draws += (stat.draws || 0);
                    j.all_time_losses += (stat.losses || 0);

                    if (nome === campeao) j.ouro += 1;
                    else if (nome === vice) j.prata += 1;
                    else if (nome === terceiro) j.bronze += 1;
                }
            });
        });

        return resposta.status(200).json(Array.from(mapaJogadores.values()));
    } catch (erro) {
        console.error("Erro ALL-TIME:", erro);
        return resposta.status(500).json({ erro: "Falha ao compilar histórico de todos os tempos." });
    }
});

//==== LISTAR TIMES E CLASSIFICACAO ====//
app.get('/TEAMS', async (requisicao, resposta) => {
    try {
        const { data: classificacao, error } = await supabase.from('TEAMS')
            .select('*')
            .neq('team_player', 'INATIVO')
            .order('points', { ascending: false }).order('goals_score', { ascending: false });

        if (error) throw error;
        return resposta.status(200).json(classificacao);

    } catch (erro) {
        console.error("Erro ao puxar a classificação:", erro);
        return resposta.status(500).json({ erro: "Falha ao carregar a tabela de times." });
    }
});

//==== LISTAR TODAS AS PARTIDAS ====//
app.get('/GAMES', async (requisicao, resposta) => {
    try {
        const { data: jogos, error } = await supabase.from('GAMES').select('*').order('match_id', { ascending: true });
        if (error) throw error;
        return resposta.status(200).json(jogos);
    } catch (erro) {
        console.error("Erro ao puxar os jogos:", erro);
        return resposta.status(500).json({ erro: "Falha interna ao tentar listar as partidas." });
    }
});

//==== CADASTRAR NOVO JOGADOR ====//
app.post('/TEAMS', async (requisicao, resposta) => {
    try {
        const {name_player, team_player, color, ovr, formation} = requisicao.body;

        if (!name_player || !team_player) {
            return resposta.status(400).json({ erro: "Nome do jogador e da equipe são obrigatórios!" });
        }

        const { data: jogadorExistente } = await supabase.from('TEAMS')
            .select('id, team_player')
            .ilike('name_player', name_player.trim()) 
            .maybeSingle();

        if (jogadorExistente) {
            if (jogadorExistente.team_player === 'INATIVO') {
                return resposta.status(400).json({ erro: "Este jogador já existe e está INATIVO. Vá na tela de Copas e reative-o." });
            }
            return resposta.status(400).json({ erro: "Já existe um jogador ativo com esse nome." });
        }

        const { data: timeCadastrado, error: erroCadastro } = await supabase.from('TEAMS').insert([{
            name_player: name_player.trim(), 
            team_player: team_player,
            color: color || "#FFFFFF",
            ovr: ovr || 75,
            formation: formation || "4-4-2",
            squad: [], points: 0, goals_score: 0, goals_conceded: 0, matches_played: 0, wins: 0, draws: 0, losses: 0
        }]).select().single();    
        
        if (erroCadastro) throw erroCadastro;
        
        return resposta.status(201).json({ mensagem: "Jogador cadastrado com todos os detalhes!", dados: timeCadastrado });
    } catch (erro) {
        console.error("Erro ao cadastrar:", erro);
        return resposta.status(500).json({ erro: "Falha ao registar o jogador." });
    }
});

//==== EDITAR JOGADOR E EQUIPE ====//
app.put('/TEAMS/:id', async (requisicao, resposta) => {
    try {
        const idJogador = requisicao.params.id;
        const dadosParaAtualizar = requisicao.body; 

        const { data: jogadorAtualizado, error } = await supabase.from('TEAMS').update(dadosParaAtualizar).eq('id', idJogador).select().single();
        if (error) throw error;
        return resposta.status(200).json({ mensagem: "Registo atualizado com sucesso!", dados: jogadorAtualizado });
    } catch (erro) {
        return resposta.status(500).json({ erro: "Falha ao tentar editar as informações." });
    }
});

//==== DESATIVAR PLAYER (SOFT DELETE PARA GELADEIRA) ====//
app.put('/TEAMS/DESATIVAR/:id', async (requisicao, resposta) => {
    try {
        const idJogador = requisicao.params.id;
        const { error } = await supabase.from('TEAMS').update({
            team_player: 'INATIVO', squad: [], points: 0, goals_score: 0, goals_conceded: 0, matches_played: 0, wins: 0, draws: 0, losses: 0, grupo: null
        }).eq('id', idJogador);

        if (error) throw error;
        return resposta.status(200).json({ mensagem: `Jogador desativado e enviado para o histórico.` });
    } catch (erro) {
        return resposta.status(500).json({ erro: "Falha ao tentar desativar o jogador." });
    }
});

//==== REATIVAR PLAYER ====//
app.put('/TEAMS/REATIVAR/:id', async (requisicao, resposta) => {
    try {
        const idJogador = requisicao.params.id;
        const { error } = await supabase.from('TEAMS').update({ team_player: 'Sem Time' }).eq('id', idJogador);

        if (error) throw error;
        return resposta.status(200).json({ mensagem: `Lenda reativada com sucesso!` });
    } catch (erro) {
        return resposta.status(500).json({ erro: "Falha ao reativar o jogador." });
    }
});

//==== REMOVER PLAYER EM DEFINITIVO (HARD DELETE) ====//
app.delete('/TEAMS/:id', async (requisicao, resposta) => {
    try {
        const idJogador = requisicao.params.id;
        const { error } = await supabase.from('TEAMS').delete().eq('id', idJogador);

        if (error) throw error;
        return resposta.status(200).json({ mensagem: `O jogador com o ID ${idJogador} foi eliminado.` });
    } catch (erro) {
        return resposta.status(500).json({ erro: "Falha ao tentar eliminar o jogador." });
    }
});

//==== DRAFT DE ATLETAS ====//
app.post('/TEAMS/DRAFT', async (requisicao, resposta) => {
    try {
        const { name, position, ovr, destination } = requisicao.body;

        if (!name || !position || !ovr || !destination) {
            return resposta.status(400).json({ erro: "Dados insuficientes para o draft." });
        }

        const { data: timesValidos, error: erroTimes } = await supabase.from('TEAMS').select('*').neq('team_player', 'Sem Time').neq('team_player', 'INATIVO');
        if (erroTimes) throw erroTimes;
        
        if (!timesValidos || timesValidos.length === 0) return resposta.status(400).json({ erro: "Não há times válidos para o draft." });

        let selectedTeam;
        if (destination === "RANDOM") {
            const randomTeamIndex = Math.floor(Math.random() * timesValidos.length);
            selectedTeam = timesValidos[randomTeamIndex];
        } else {
            selectedTeam = timesValidos.find(t => t.id.toString() === destination.toString());
            if (!selectedTeam) return resposta.status(404).json({ erro: "Time destino não encontrado." });
        }

        const newAthlete = { id: Date.now().toString(), name, position, ovr: Number(ovr) };
        const squadAtual = selectedTeam.squad || [];
        const newSquad = [...squadAtual, newAthlete];
        const newTeamOvr = Math.round(newSquad.reduce((acc, curr) => acc + curr.ovr, 0) / newSquad.length);

        const { error: erroUpdate } = await supabase.from('TEAMS').update({ squad: newSquad, ovr: newTeamOvr }).eq('id', selectedTeam.id);
        if (erroUpdate) throw erroUpdate;

        return resposta.status(200).json({ mensagem: "Atleta draftado com sucesso!", atleta: newAthlete, time: selectedTeam });
    } catch (erro) {
        console.error("Erro no draft:", erro);
        return resposta.status(500).json({ erro: "Falha interna." });
    }
});

//==== PONTOS CORRIDOS ====//
app.post('/GAMES/GERAR', async (requisicao, resposta) => {
    try {
        const formato = requisicao.body.formato || "single";
        await supabase.from('GAMES').delete().neq('match_id', 0);

        const { data: times } = await supabase.from('TEAMS').select('*').neq('team_player', 'Sem Time').neq('team_player', 'INATIVO');
        if (!times || times.length < 2) return resposta.status(400).json({ erro: "Times insuficientes." });

        let partidas = gerarTabelaRoundRobin(times);

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
        return resposta.status(500).json({ erro: "Erro interno." });
    }
});

//==== MATA-MATA (ATUALIZADO COM IDA E VOLTA INTELIGENTE) ====//
app.post('/GAMES/MATA-MATA', async (requisicao, resposta) => {
    try {
        const size = requisicao.body.size || 4; 
        const logic = requisicao.body.logic || "POSITIONAL"; 
        const hasThirdPlace = requisicao.body.hasThirdPlace || false; 
        const formato = requisicao.body.formato || "single"; 
        const isHomeAway = formato === "homeaway";
        
        //limpa jogos anteriores de mata-mata
        await supabase.from('GAMES').delete().gte('round', 90);

        //pega os times validos ordenados pela campanha
        const { data: times } = await supabase.from('TEAMS').select('id, name_player').neq('team_player', 'Sem Time').neq('team_player', 'INATIVO').order('points', { ascending: false }).order('goals_score', { ascending: false });

        let classificados = times.slice(0, size);

        // LÓGICA DE CRUZAMENTO
        if (logic === "RANDOM") {
            classificados = classificados.sort(() => Math.random() - 0.5);
        } else {
            const cruzamentos = [];
            for(let i = 0; i < size / 2; i++) {
                cruzamentos.push(classificados[i]);
                cruzamentos.push(classificados[size - 1 - i]);
            }
            classificados = cruzamentos;
        }

        let partidasParaSalvar = [];
        let rodadaAtual = 90; 
        let idFalsoMataMata = 5000; 
        
        let jogosNestaFase = size / 2;
        let indexTime = 0;

        // 1. Cria a Primeira Fase (Com Ida e Volta se ativado)
        for (let i = 0; i < jogosNestaFase; i++) {
            partidasParaSalvar.push({
                match_id: idFalsoMataMata++,
                team_house_id: classificados[indexTime]?.id || null,
                team_out_id: classificados[indexTime + 1]?.id || null,
                goals_home: 0, goals_out: 0, status_game: "Pendente", round: rodadaAtual
            });
            if (isHomeAway) {
                partidasParaSalvar.push({
                    match_id: idFalsoMataMata++,
                    team_house_id: classificados[indexTime + 1]?.id || null, // Inverte mando
                    team_out_id: classificados[indexTime]?.id || null,
                    goals_home: 0, goals_out: 0, status_game: "Pendente", round: rodadaAtual + 1
                });
            }
            indexTime += 2;
        }

        rodadaAtual += isHomeAway ? 2 : 1;

        // 2. Cria as Fases Seguintes VAZIAS (Mantendo a estrutura de Ida e Volta)
        let jogosProximasFases = jogosNestaFase;
        while (jogosProximasFases > 1) {
            jogosProximasFases = Math.floor(jogosProximasFases / 2);
            for (let i = 0; i < jogosProximasFases; i++) {
                partidasParaSalvar.push({
                    match_id: idFalsoMataMata++,
                    team_house_id: null, team_out_id: null,
                    goals_home: 0, goals_out: 0, status_game: "Pendente", round: rodadaAtual
                });
                if (isHomeAway) {
                    partidasParaSalvar.push({
                        match_id: idFalsoMataMata++,
                        team_house_id: null, team_out_id: null,
                        goals_home: 0, goals_out: 0, status_game: "Pendente", round: rodadaAtual + 1
                    });
                }
            }
            rodadaAtual += isHomeAway ? 2 : 1;
        }

        // 3. Cria o jogo de 3º Lugar (Sempre jogo único, rodada 99)
        if (hasThirdPlace && size > 2) {
            partidasParaSalvar.push({
                match_id: idFalsoMataMata++,
                team_house_id: null, team_out_id: null,
                goals_home: 0, goals_out: 0, status_game: "Pendente", round: 99
            });
        }

        //salva confrontos no banco
        const { error: erroInsert } = await supabase.from('GAMES').insert(partidasParaSalvar);
        if (erroInsert) throw erroInsert;

        return resposta.status(201).json({ mensagem: "Árvore completa gerada!" });
    } catch (erro) {
        console.error("Erro ao gerar mata-mata:", erro);
        return resposta.status(500).json({ erro: "Falha interna." });
    }   
});

//==== SORTEIO DOS TIMES ====//
app.post('/TEAMS/SORTEIO', async (requisicao, resposta) => {
    try {
        const listaJogadores = requisicao.body.jogadores;
        const listaTimes = requisicao.body.times;

        if (!listaJogadores || !listaTimes || listaJogadores.length === 0 || listaTimes.length === 0) {
            return resposta.status(400).json({ erro: "É necessário enviar uma lista de jogadores e uma lista de times para o sorteio!" });
        }

        const timesEmbaralhados = [...listaTimes];
        for (let i = timesEmbaralhados.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [timesEmbaralhados[i], timesEmbaralhados[j]] = [timesEmbaralhados[j], timesEmbaralhados[i]];
        }

        const novosCadastros = listaJogadores.map((nomeJogador, index) => {
            return {
                name_player: nomeJogador, team_player: timesEmbaralhados[index % timesEmbaralhados.length],
                points: 0, goals_score: 0, goals_conceded: 0, matches_played: 0, wins: 0, draws: 0, losses: 0
            };
        });

        const { data: timesCadastrados, error: erroCadastro } = await supabase.from('TEAMS').insert(novosCadastros).select();
        if (erroCadastro) throw erroCadastro;
        return resposta.status(201).json({ mensagem: `Sorteio realizado!`, resultado: timesCadastrados });
    } catch (erro) {
        return resposta.status(500).json({ erro: "Falha ao sortear os times." });
    }   
});

//==== FILTROS ====//
app.get('/GAMES/FILTRO', async (requisicao, resposta) => {
    try {
        const{rodada, status} = requisicao.query; 
        let consulta = supabase.from('GAMES').select('*');

        if (rodada) consulta = consulta.eq('round', Number(rodada));
        if (status) consulta = consulta.eq('status_game', status);

        const { data: jogos, error } = await consulta.order('match_id', { ascending: true });
        if (error) throw error;
        return resposta.status(200).json(jogos);
    } catch (erro) {
        return resposta.status(500).json({ erro: "Erro ao buscar partidas filtradas." });
    }
});

//==== RESETAR CAMPEONATO ====//
app.delete('/GAMES/RESET',  async(requisicao, resposta) =>{
    try{
        const clearTeams = requisicao.query.clearTeams === 'true'; 

        const {error: erroDelete} = await supabase.from('GAMES').delete().neq('match_id', 0); 
        if (erroDelete) throw erroDelete;
    
        let updateData = { points: 0, goals_score: 0, goals_conceded: 0, matches_played: 0, wins: 0, draws: 0, losses: 0, grupo: null };
        if (clearTeams) {
            updateData.team_player = "Sem Time";
            updateData.squad = [];
        }

        const { error: erroUpdate } = await supabase.from('TEAMS').update(updateData).neq('id', 0).neq('team_player', 'INATIVO');
        if (erroUpdate) throw erroUpdate;

        return resposta.status(200).json({mensagem: "Operação realizada com sucesso!"});
    } catch (erro) {
        return resposta.status(500).json({ erro: "Falha interna ao tentar limpar o banco de dados." });
    }
});

//==== ATUALIZAR PARTIDAS E CLASSIFICACAO (COM MOTOR DE AGREGADO E PÊNALTIS) ====//
app.put('/GAMES/:id', async(requisicao, resposta) =>{
    try {
        const idPartida = requisicao.params.id;
        const golsCasaNovo = requisicao.body.goals_home;
        const golsForaNovo = requisicao.body.goals_out;
        const statusDesejado = requisicao.body.status_game; 
        const timeAvancouPenaltis = requisicao.body.advancing_team_id; 

        // Lê config para saber se é homeaway
        const { data: configData } = await supabase.from('CONFIGS').select('dados').eq('id', 1).single();
        const isHomeAway = configData?.dados?.knockoutFormat === 'homeaway';

        const { data: partidaAntiga } = await supabase.from('GAMES').select('*').eq('match_id', Number(idPartida)).maybeSingle();
        if (!partidaAntiga) return resposta.status(404).json({ erro: "Partida não encontrada." });
        
        const statusAntigo = partidaAntiga.status_game;
        const idCasa = partidaAntiga.team_house_id;
        const idFora = partidaAntiga.team_out_id;

        // Grava o Pênalti
        const {error: erroJogo} = await supabase.from('GAMES').update({ 
            goals_home: golsCasaNovo, goals_out: golsForaNovo, status_game: statusDesejado, penalty_winner_id: timeAvancouPenaltis || null 
        }).eq('match_id', Number(idPartida));
        if(erroJogo) throw erroJogo;

        if (statusDesejado === "Ao Vivo") return resposta.json({ mensagem: `Ao Vivo!` });

        if (statusDesejado === "Finalizado") {
            // MATEMÁTICA DA CLASSIFICAÇÃO GERAL
            let dPtsC = 0, dPtsF = 0, dVitC = 0, dVitF = 0, dEmpC = 0, dEmpF = 0, dDerC = 0, dDerF = 0, dGpC = 0, dGpF = 0, dGcC = 0, dGcF = 0;
            let dPartidas = statusAntigo !== "Finalizado" ? 1 : 0; 

            if (statusAntigo === "Finalizado") {
                const gcV = partidaAntiga.goals_home; const gfV = partidaAntiga.goals_out;
                if (gcV > gfV) { dPtsC -= 3; dVitC -= 1; dDerF -= 1; }
                else if (gcV < gfV) { dPtsF -= 3; dVitF -= 1; dDerC -= 1; }
                else { dPtsC -= 1; dPtsF -= 1; dEmpC -= 1; dEmpF -= 1; }
                dGpC -= gcV; dGcC -= gfV; dGpF -= gfV; dGcF -= gcV; 
            }

            if (golsCasaNovo > golsForaNovo) { dPtsC += 3; dVitC += 1; dDerF += 1; }
            else if (golsCasaNovo < golsForaNovo) { dPtsF += 3; dVitF += 1; dDerC += 1; }
            else { dPtsC += 1; dPtsF += 1; dEmpC += 1; dEmpF += 1; }
            
            dGpC += golsCasaNovo; dGcC += golsForaNovo; dGpF += golsForaNovo; dGcF += golsCasaNovo;

            const {data: tCasa} = await supabase.from('TEAMS').select('*').eq('id', idCasa).single();
            const {data: tFora} = await supabase.from('TEAMS').select('*').eq('id', idFora).single();

            if (tCasa) await supabase.from('TEAMS').update({ points: tCasa.points + dPtsC, wins: tCasa.wins + dVitC, draws: tCasa.draws + dEmpC, losses: tCasa.losses + dDerC, goals_score: tCasa.goals_score + dGpC, goals_conceded: tCasa.goals_conceded + dGcC, matches_played: tCasa.matches_played + dPartidas }).eq('id', idCasa);
            if (tFora) await supabase.from('TEAMS').update({ points: tFora.points + dPtsF, wins: tFora.wins + dVitF, draws: tFora.draws + dEmpF, losses: tFora.losses + dDerF, goals_score: tFora.goals_score + dGpF, goals_conceded: tFora.goals_conceded + dGcF, matches_played: tFora.matches_played + dPartidas }).eq('id', idFora);

            // 👇 MOTOR DA ÁRVORE (Soma Agregados Automaticamente) 👇
            if (partidaAntiga.round >= 90 && partidaAntiga.round < 99) {
                let idVencedor = null;
                let idPerdedor = null;
                let deveAvancar = false;

                if (!isHomeAway) {
                    deveAvancar = true;
                    if (golsCasaNovo > golsForaNovo) { idVencedor = idCasa; idPerdedor = idFora; }
                    else if (golsCasaNovo < golsForaNovo) { idVencedor = idFora; idPerdedor = idCasa; }
                    else if (timeAvancouPenaltis) { idVencedor = timeAvancouPenaltis; idPerdedor = (timeAvancouPenaltis === idCasa) ? idFora : idCasa; }
                } else {
                    // É Ida e Volta. Precisamos checar se é jogo de Volta para somar.
                    // Na nossa lógica, o jogo de Volta sempre tem a mesma paridade e vem depois.
                    // Procura o jogo anterior entre os mesmos times com mando invertido:
                    const { data: idaGame } = await supabase.from('GAMES').select('*').eq('round', partidaAntiga.round - 1).eq('team_house_id', idFora).eq('team_out_id', idCasa).maybeSingle();

                    if (idaGame) {
                        deveAvancar = true; // É Volta! Avança!
                        const aggCasa = golsCasaNovo + idaGame.goals_out; // Casa agora, era Fora antes
                        const aggFora = golsForaNovo + idaGame.goals_home;

                        if (aggCasa > aggFora) { idVencedor = idCasa; idPerdedor = idFora; }
                        else if (aggCasa < aggFora) { idVencedor = idFora; idPerdedor = idCasa; }
                        else if (timeAvancouPenaltis) { idVencedor = timeAvancouPenaltis; idPerdedor = (timeAvancouPenaltis === idCasa) ? idFora : idCasa; }
                    }
                }
                
                if (deveAvancar && idVencedor) {
                    const { data: jogosRodadaAtual } = await supabase.from('GAMES').select('*').eq('round', partidaAntiga.round).order('match_id', { ascending: true });
                    const matchIndex = jogosRodadaAtual.findIndex(j => j.match_id === Number(idPartida));
                    
                    const proximaRodadaBase = isHomeAway ? partidaAntiga.round + 1 : partidaAntiga.round + 1;
                    const { data: jogosProximaRodadaIda } = await supabase.from('GAMES').select('*').eq('round', proximaRodadaBase).order('match_id', { ascending: true });
                    
                    if (jogosProximaRodadaIda && jogosProximaRodadaIda.length > 0) {
                        const nextMatchIndex = Math.floor(matchIndex / 2);
                        const isCasa = matchIndex % 2 === 0; 
                        
                        // Atualiza a Ida da próxima fase
                        const nextMatchIda = jogosProximaRodadaIda[nextMatchIndex];
                        if (nextMatchIda) {
                            const updateDataIda = isCasa ? { team_house_id: idVencedor } : { team_out_id: idVencedor };
                            await supabase.from('GAMES').update(updateDataIda).eq('match_id', nextMatchIda.match_id);
                        }

                        // Atualiza a Volta da próxima fase (Invertendo o mando)
                        if (isHomeAway) {
                            const { data: jogosProximaRodadaVolta } = await supabase.from('GAMES').select('*').eq('round', proximaRodadaBase + 1).order('match_id', { ascending: true });
                            const nextMatchVolta = jogosProximaRodadaVolta[nextMatchIndex];
                            if (nextMatchVolta) {
                                const updateDataVolta = isCasa ? { team_out_id: idVencedor } : { team_house_id: idVencedor };
                                await supabase.from('GAMES').update(updateDataVolta).eq('match_id', nextMatchVolta.match_id);
                            }
                        }

                        // Lógica da Disputa de 3º Lugar
                        if (jogosRodadaAtual.length === 2 && idPerdedor) {
                            const { data: jogoTerceiro } = await supabase.from('GAMES').select('*').eq('round', 99).maybeSingle();
                            if (jogoTerceiro) {
                                const updateTerceiro = isCasa ? { team_house_id: idPerdedor } : { team_out_id: idPerdedor };
                                await supabase.from('GAMES').update(updateTerceiro).eq('match_id', jogoTerceiro.match_id);
                            }
                        }
                    }
                }
            }
            return resposta.json({ mensagem: `Atualizado.` });
        }
    } catch (erro) {
        console.error("Erro ao atualizar o jogo:", erro);
        return resposta.status(500).json({ erro: "Falha ao tentar atualizar placar." });
    }
});

//==== FINALIZAR COPA ====//
app.post('/COPAS/FINALIZAR', async (requisicao, resposta) => {
    try {
        const nomeDaCopa = requisicao.body.nome_copa || `Copa PES ${new Date().getFullYear()}`;
        const nomeCampeao = requisicao.body.campeao || "Não definido"; 
        
        const { data: classificacao, error: erroClassificacao } = await supabase.from('TEAMS').select('*').neq('team_player', 'INATIVO').order('points', { ascending: false }).order('goals_score', { ascending: false });
        const { data: partidasHistoricas } = await supabase.from('GAMES').select('*').order('match_id', { ascending: true }); 

        if (erroClassificacao) throw erroClassificacao;
        if (!classificacao || classificacao.length === 0) return resposta.status(400).json({ erro: "Não há times cadastrados para arquivar." });

        const { data: copaSalva, error: erroCopa } = await supabase.from('CUPS').insert([{ nome_copa: nomeDaCopa, campeao: nomeCampeao, classificacao_final: classificacao, jogos_historico: partidasHistoricas }]).select().single();
        if (erroCopa) throw erroCopa;

        await supabase.from('GAMES').delete().neq('match_id', 0);
        await supabase.from('TEAMS').update({ team_player: "Sem Time", squad: [], points: 0, goals_score: 0, goals_conceded: 0, matches_played: 0, wins: 0, draws: 0, losses: 0, grupo: null }).neq('id', 0).neq('team_player', 'INATIVO');

        return resposta.status(201).json({ mensagem: `🏆 ${nomeDaCopa} finalizada!`, copa: copaSalva });
    } catch (erro) {
        return resposta.status(500).json({ erro: "Falha interna ao tentar salvar o histórico da Copa." });
    }
});

//==== LISTAR COPAS ====//
app.get('/COPAS', async (requisicao, resposta) => {
    try {
        const { data: copas, error } = await supabase.from('CUPS').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        return resposta.status(200).json(copas);
    } catch (erro) {
        return resposta.status(500).json({ erro: "Falha ao carregar copas." });
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
            if (!copasMap.has(nome_copa)) { copasMap.set(nome_copa, { nome_copa: nome_copa, campeao: String(row.campeao || "").trim(), classificacao_final: [] }); }
            copasMap.get(nome_copa).classificacao_final.push({ name_player: String(row.name_player || "").trim(), team_player: String(row.team_player || "").trim(), points: Number(row.points) || 0, wins: Number(row.wins) || 0, draws: Number(row.draws) || 0, losses: Number(row.losses) || 0, goals_score: Number(row.goals_score) || 0, goals_conceded: Number(row.goals_conceded) || 0 });
        });

        const { error } = await supabase.from('CUPS').insert(Array.from(copasMap.values()));
        if (error) throw error;
        res.status(200).json({ mensagem: "Importadas com sucesso!" });
    } catch (error) {
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
                cup.classificacao_final.forEach(stat => { linhasExcel.push({ "nome_copa": cup.nome_copa, "campeao": cup.campeao, "name_player": stat.name_player, "team_player": stat.team_player, "points": stat.points || 0, "wins": stat.wins || 0, "draws": stat.draws || 0, "losses": stat.losses || 0, "goals_score": stat.goals_score || 0, "goals_conceded": stat.goals_conceded || 0 }); });
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
        res.status(500).json({ erro: "Falha ao gerar colunas do Excel." });
    }
});

//==== RANKING GERAL ====//
app.get('/RANKING-GERAL', async (requisicao, resposta) => {
    try {
        const { data: copas, error } = await supabase.from('CUPS').select('*');
        if (error) throw error;

        const map = new Map();
        copas.forEach(cup => {
            const sortedCup = [...(cup.classificacao_final || [])].sort((a, b) => {
                if (b.points !== a.points) return b.points - a.points;
                return (b.goals_score - b.goals_conceded) - (a.goals_score - a.goals_conceded);
            });

            sortedCup.forEach((stat, index) => {
                if (!map.has(stat.name_player)) { map.set(stat.name_player, { name_player: stat.name_player, color: stat.color, copas_jogadas: 0, titulos: 0, vices: 0, terceiros: 0, points: 0, matches_played: 0, wins: 0, draws: 0, losses: 0, goals_score: 0, goals_conceded: 0 }); }
                const curr = map.get(stat.name_player);
                curr.points += (stat.points || 0); curr.matches_played += (stat.matches_played || 0); curr.wins += (stat.wins || 0); curr.draws += (stat.draws || 0); curr.losses += (stat.losses || 0); curr.goals_score += (stat.goals_score || 0); curr.goals_conceded += (stat.goals_conceded || 0); curr.copas_jogadas += 1;
                if (cup.campeao === stat.name_player || index === 0) curr.titulos += 1; else if (index === 1) curr.vices += 1; else if (index === 2) curr.terceiros += 1;
            });
        });

        const rankingFinal = Array.from(map.values()).sort((a, b) => {
            if (b.titulos !== a.titulos) return b.titulos - a.titulos; 
            if (b.points !== a.points) return b.points - a.points;     
            return (b.goals_score - b.goals_conceded) - (a.goals_score - a.goals_conceded);
        });
        return resposta.status(200).json(rankingFinal);
    } catch (erro) {
        return resposta.status(500).json({ erro: "Falha no Hall da Fama." });
    }
});

//==== DELETER/EDITAR INFOS ====//
app.put('/COPAS/:id', async (requisicao, resposta) => {
    try {
        const { data: copaAtualizada, error } = await supabase.from('CUPS').update(requisicao.body).eq('id', requisicao.params.id).select().single();
        if (error) throw error;
        return resposta.status(200).json({ mensagem: "Atualizado!", copa: copaAtualizada });
    } catch (erro) {
        return resposta.status(500).json({ erro: "Erro." });
    }
});

app.delete('/COPAS/:id', async (requisicao, resposta) => {
    try {
        const idCopa = requisicao.params.id;
        const { data: copaParaDeletar, error: erroCopa } = await supabase.from('CUPS').select('*').eq('id', idCopa).single();
        if (erroCopa) throw erroCopa;

        if (copaParaDeletar && copaParaDeletar.classificacao_final) {
            const nomesNestaCopa = copaParaDeletar.classificacao_final.map(p => p.name_player);
            const { data: outrasCopas, error: erroOutras } = await supabase.from('CUPS').select('classificacao_final').neq('id', idCopa);
            if (erroOutras) throw erroOutras;

            const nomesEmOutrasCopas = new Set();
            outrasCopas.forEach(copa => { if (copa.classificacao_final) copa.classificacao_final.forEach(p => nomesEmOutrasCopas.add(p.name_player)); });

            const jogadoresExclusivos = nomesNestaCopa.filter(nome => !nomesEmOutrasCopas.has(nome));
            if (jogadoresExclusivos.length > 0) {
                await supabase.from('TEAMS').delete().eq('team_player', 'INATIVO').in('name_player', jogadoresExclusivos);
            }
        }
        await supabase.from('CUPS').delete().eq('id', idCopa);
        return resposta.status(200).json({ mensagem: `Apagada.` });
    } catch (erro) {
        return resposta.status(500).json({ erro: "Erro." });
    }
});

//==== GERAR FASE DE GRUPOS ====//
app.post('/GAMES/GERAR-GRUPOS', async (requisicao, resposta) => {
    try {
        const numGrupos = Number(requisicao.body.numGrupos) || 2;
        const formato = requisicao.body.formato || "single";
        await supabase.from('GAMES').delete().neq('match_id', 0);
        
        const { data: times, error: erroTimes } = await supabase.from('TEAMS').select('*').neq('team_player', 'Sem Time').neq('team_player', 'INATIVO');
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
            todasPartidas.push(...gerarTabelaRoundRobin(timesDoGrupo));
        }
        if (formato === "homeaway") {
            const maxRodada = Math.max(...todasPartidas.map(p => p.round));
            todasPartidas = todasPartidas.concat(todasPartidas.map(p => ({ ...p, team_house_id: p.team_out_id, team_out_id: p.team_house_id, round: p.round + maxRodada })));
        }
        await supabase.from('GAMES').insert(todasPartidas);
        return resposta.status(201).json({ mensagem: "Grupos gerados!" });
    } catch (erro) {
        return resposta.status(500).json({ erro: "Falha." });
    }
});

function gerarTabelaRoundRobin(timesValidos) {
    const times = [...timesValidos];
    if (times.length % 2 !== 0) times.push({ id: null, byes: true }); 
    const totalRodadas = times.length - 1;
    const jogosPorRodada = times.length / 2;
    let partidas = [];
    for (let r = 0; r < totalRodadas; r++) {
        for (let i = 0; i < jogosPorRodada; i++) {
            const casa = times[i], fora = times[times.length - 1 - i];
            if (casa.id !== null && fora.id !== null) partidas.push({ team_house_id: casa.id, team_out_id: fora.id, goals_home: 0, goals_out: 0, status_game: "Pendente", round: r + 1 });
        }
        times.splice(1, 0, times.pop());
    }
    return partidas;
}