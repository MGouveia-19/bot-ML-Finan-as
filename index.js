const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');

// Função para extrair os dados do template de gastos enviado no WhatsApp
function parseExpenseMessage(text) {
    try {
        const lines = text.split('\n');
        let data = {};

        lines.forEach(line => {
            const parts = line.split(':');
            if (parts.length >= 2) {
                const key = parts[0].trim().toLowerCase();
                const value = parts.slice(1).join(':').trim(); // Trata caso haja dois pontos no valor

                if (key.includes('item')) data.item = value;
                if (key.includes('valor')) data.valor = parseFloat(value.replace('R$', '').trim().replace(',', '.'));
                if (key.includes('conta')) data.conta = value;
                if (key.includes('pagamento') || key.includes('meio')) data.pagamento = value;
            }
        });

        // Adiciona carimbo de metadados automático
        data.timestamp = new Date().toISOString();
        data.autor = "M&L Finanças Bot";

        return data;
    } catch (error) {
        console.error('Erro ao interpretar a mensagem:', error);
        return null;
    }
}

async function connectToWhatsApp() {
    // 1. Gerencia a sessão e o QR Code localmente
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    const sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        auth: state
    });

    // 2. Salva as credenciais sempre que houver atualização
    sock.ev.on('creds.update', saveCreds);

    // 3. Monitora o status da conexão
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Conexão fechada. Tentando reconectar...', shouldReconnect);
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            console.log('🤖 Bot do M&L Finanças conectado com sucesso ao WhatsApp!');
        }
    });

    // 4. Escuta as mensagens recebidas em tempo real
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0];
        if (!m.message || m.key.fromMe) return;

        const messageText = m.message.conversation || m.message.extendedTextMessage?.text;
        if (!messageText) return;

        // Verifica se a mensagem contém o template de controle de gastos
        if (messageText.includes('*Controle de Gastos*')) {
            console.log('📥 Nova despesa detectada no chat!');
            
            const despesaProcessada = parseExpenseMessage(messageText);
            console.log('📊 Dados extraídos:', despesaProcessada);
            
            // Responde no chat confirmando o recebimento e a leitura correta
            await sock.sendMessage(m.key.remoteJid, { 
                text: `✅ Gasto processado com sucesso!\n📌 Item: ${despesaProcessada.item || 'Não identificado'}\n💰 Valor: R$ ${despesaProcessada.valor || '0.00'}` 
            });
        }
    });
}

connectToWhatsApp();
