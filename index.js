const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');

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

    // 4. Escuta as mensagens recebidas
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0];
        if (!m.message || m.key.fromMe) return;

        const messageText = m.message.conversation || m.message.extendedTextMessage?.text;
        if (!messageText) return;

        // Aqui é onde o robô vai ler o seu template de gastos!
        if (messageText.includes('*Controle de Gastos*')) {
            console.log('📥 Nova despesa detectada no chat!');
            
            // TODO: Adicionar a lógica de extração dos campos (Valor, Conta, etc.)
            // e o carimbo automático (Malu + Horário)
            
            await sock.sendMessage(m.key.remoteJid, { text: '✅ Gasto registrado com sucesso pelo M&L Finanças!' });
        }
    });
}

connectToWhatsApp();
