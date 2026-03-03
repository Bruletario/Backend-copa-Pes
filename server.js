//======================//
//====CONFIGS SERVER====//
//======================//

//carrega as variaveis de seguranca do .env
require('dotenv').config();

//importando ferramentas
const express = require('express');
const cors = require('cors'); // CORREÇÃO 1: Importando o CORS
const {createClient} = require('@supabase/supabase-js');

//inicializa servidor
const app = express();
const porta = 3000;

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
    console.log(`Servidor rodando! Acesse http://localhost:${porta}`)});

//====================//
//====PARTE LOGICA====//
//====================//

//====LISTAR TIMES E CLASSIFICACAO====//

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

//====LISTAR TODAS AS PARTIDAS====//
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

//====ATUALIZAR PARTIDAS E CLASSIFICACAO====//

app.put('/GAMES/:id', async(requisicao, resposta) =>{
    try {
        //pega o id do jogo e os gols
        const idPartida = requisicao.params.id;
        const golsCasa = requisicao.body.goals_home;
        const golsFora = requisicao.body.goals_out;

        //verifica se a partida existe e se já foi finalizada ---
        const { data: partidaExistente } = await supabase
            .from('GAMES')
            .select('status_game')
            .eq('match_id', Number(idPartida))
            .maybeSingle();

        if (!partidaExistente) {
            return resposta.status(404).json({ erro: "Partida não encontrada no banco de dados." });
        }

        if (partidaExistente.status_game === "Finalizado") {
            return resposta.status(400).json({ erro: "Esta partida já foi finalizada e os pontos já foram computados!" });
        }

        //atualizar o jogo e pegar o id dos times .select().single() serve pra atualizar no banco
        const {data: jogoAtualizado, error: erroJogo} = await supabase.from('GAMES').update({
            goals_home: golsCasa,
            goals_out: golsFora,
            status_game: "Finalizado"  
        }).eq('match_id', Number(idPartida)).select().maybeSingle();

        if(erroJogo){
            //verifica se deu erro, se deu retorna erro, se nao retona a info
            return resposta.status(500).json({erro:erroJogo.message});
        }

        //separando ids que vieram do banco
        const idCasa = jogoAtualizado.team_house_id;
        const idFora = jogoAtualizado.team_out_id;

        let pontosCasa = 0;
        let pontosFora = 0;

        if (golsCasa > golsFora){
            pontosCasa = 3; //vitoria p casas
        }
        else if (golsFora > golsCasa) {
            pontosFora = 3; //vitoria p fora
        }
        else if (golsCasa === golsFora){ //empate
            pontosCasa = 1; 
            pontosFora = 1;
        }

        let saldoFora = golsFora - golsCasa;
        let saldoCasa = golsCasa - golsFora;
        
        //consultar os dados atuais
        const {data: timeCasaAtual} = await supabase.from('TEAMS').select('points, goals_score').eq('id', idCasa).single();
        const {data: timeForaAtual} = await supabase.from('TEAMS').select('points, goals_score').eq('id', idFora).single();

        //soma dos pontos
        const novoPontoCasa = timeCasaAtual.points + pontosCasa;
        const novoPontoFora = timeForaAtual.points + pontosFora;

        //soma dos saldos
        const novoSaldoCasa = timeCasaAtual.goals_score + saldoCasa;
        const novoSaldoFora = timeForaAtual.goals_score + saldoFora;

        //depositar novos valores no bd casa
        await supabase.from('TEAMS').update({

            points: novoPontoCasa,
            goals_score: novoSaldoCasa
        }).eq('id', idCasa);

        //depositar novos valores no bd fora
        await supabase.from('TEAMS').update({

            points: novoPontoFora,
            goals_score: novoSaldoFora
        }).eq('id', idFora)

        //resposta temporaria
        return resposta.json({ 
            mensagem: `Súmula registrada! ${golsCasa}x${golsFora}. Tabela de classificação atualizada com sucesso.`
        });

    } catch (erro) {
        console.error("Erro ao atualizar o jogo:", erro);
        return resposta.status(500).json({ 
            erro: "Falha interna ao tentar atualizar o placar." 
        });
    }
});

//====CADASTRAR NOVO JOGADOR====//

app.post('/TEAMS', async (requisicao, resposta)=>{

    try{
        //coleta o nome dos jogadores do front
        const nomeJogador = requisicao.body.name_player;
        const nomeTime = requisicao.body.team_player;

        //tratamento de erro - cadastro vazio
        if(!nomeJogador || !nomeTime){
            return resposta.status(400).json({
                erro: "É necessário colocar o nome do jogador e do time!"});
        }

        const {data: timeCadastrado, error: erroCadastro} = await supabase.from('TEAMS').insert([{
            name_player: nomeJogador,
            team_player: nomeTime,
            points: 0,
            goals_score: 0}]).select().single();    
        
        //se o banco recusar ele joga p o catch
        if(erroCadastro) throw erroCadastro;
            return resposta.status(201).json({
                mensagem: "Jogador cadastrado com sucesso na Copa PES!",
                dados: timeCadastrado});

    //captura o erro 
    }catch (erro) {
        console.error("Erro ao cadastrar:", erro);
        return resposta.status(500).json({ 
            erro: "Falha interna no servidor ao tentar registrar o jogador." 
        });
    }
});

//====GERAR CAMPEONATO TODOS CONTRA TODOS====//
app.post('/GAMES/GERAR', async (requisicao, resposta) =>{
    try {
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
                rodadaAtual++
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

//====MATA-MATA====//
app.post('/GAMES/MATA-MATA', async (requisicao, resposta) => {
    try {
       //pega os times classificados
        const { data: times, error: erroTimes } = await supabase.from('TEAMS').select('id, name_player').order('points', { ascending: false }).order('goals_score', { ascending: false });

        if (erroTimes) throw erroTimes;
        const totalTimes = times.length;

        if (totalTimes < 2) {
            return resposta.status(400).json({ 
                erro: "É preciso pelo menos 2 jogadores para fazer um mata-mata!" 
            });
        }

        // verifica o tamanho ideal da chave
        let tamanhoChave = 2;
        while (tamanhoChave < totalTimes) {
            tamanhoChave *= 2;
        }

        //calcula quantos times iriam pra repescagem
        const timesPrivilegiados = tamanhoChave - totalTimes; 
        
        const partidasParaSalvar = [];
        
        //numero 99 provisoriamente p indicar que é fase eliminatoria
        const identificadorFase = 99; 

        //monta os confrontos da repescagerm
        let indiceMelhor = timesPrivilegiados; 
        let indicePior = totalTimes - 1;

        while (indiceMelhor < indicePior) {
            partidasParaSalvar.push({
                team_house_id: times[indiceMelhor].id,
                team_out_id: times[indicePior].id,
                goals_home: 0,
                goals_out: 0,
                status_game: "Pendente",
                round: identificadorFase 
            });
            indiceMelhor++; //pega o proximo melhor
            indicePior--;   //pega o próximo pior
        }

        //salva no banco
        const { error: erroInsert } = await supabase.from('GAMES').insert(partidasParaSalvar);

        if (erroInsert) throw erroInsert;

        //mensagem de teste
        let mensagem = `Mata-mata gerado com ${partidasParaSalvar.length} partidas!`;
        if (timesPrivilegiados > 0) {
            mensagem += ` Como tínhamos ${totalTimes} times, os ${timesPrivilegiados} primeiros colocados passaram direto para a próxima fase!`;
        } else {
            mensagem += ` Chaveamento perfeito de ${tamanhoChave} times. Ninguém passou direto.`;
        }

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

//====SORTEIO DOS TIMES====//
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
                goals_score: 0
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