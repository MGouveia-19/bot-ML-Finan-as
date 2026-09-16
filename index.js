const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const pino = require('pino');

async function iniciarBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    
    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' })
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0];
        if (!m.message || m.key.fromMe) return;

        const textoMensagem = m.message.conversation || m.message.extendedTextMessage?.text || '';

        // 1. Identifica se é o modelo de Controle de Gastos
        if (textoMensagem.includes('*Controle de Gastos*')) {
            const linhas = textoMensagem.split('\n');
            
            const descritivoOriginal = linhas[1]?.replace('Descritivo da compra:', '').trim() || '';
            const valor = parseFloat(linhas[2]?.replace('Valor:', '').trim() || '0');
            const conta = linhas[3]?.replace('Conta:', '').trim() || '';
            const meioPagamento = linhas[4]?.replace('Meio de pagamento:', '').trim() || '';
            const tipo = linhas[5]?.replace('Tipo:', '').trim() || '';

            const usuarioRemetente = "Malu";
            const timestampMensagem = new Date(m.messageTimestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const descritivoFinal = `${descritivoOriginal} — (Lançado por ${usuarioRemetente} às ${timestampMensagem})`;

            const novoLancamento = {
                descritivo: descritivoFinal,
                valor,
                conta,
                meioPagamento,
                tipo,
                responsavel: usuarioRemetente
            };

            console.log("Novo gasto capturado via WhatsApp:", novoLancamento);
        }

        // 2. Identifica se é o comando de atualizar fatura (ex: "cartão latam pago")
        if (textoMensagem.toLowerCase().includes('pago') && textoMensagem.toLowerCase().includes('cartão')) {
            console.log("Comando de baixa de fatura identificado:", textoMensagem);
        }
    });
}

iniciarBot();
