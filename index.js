const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'gastos.json');

// Função para salvar a despesa no arquivo JSON local
function salvarDespesa(novaDespesa) {
    try {
        let dadosAtuais = [];
        if (fs.existsSync(DB_FILE)) {
            const arquivoConteudo = fs.readFileSync(DB_FILE, 'utf8');
            dadosAtuais = JSON.parse(arquivoConteudo);
        }
        dadosAtuais.push(novaDespesa);
        fs.writeFileSync(DB_FILE, JSON.stringify(dadosAtuais, null, 2), 'utf8');
        console.log('💾 Despesa salva com sucesso no banco local (gastos.json)!');
    } catch (error) {
        console.error('❌ Erro ao salvar a despesa:', error);
    }
}

// Função para extrair os dados do template de gastos enviado no WhatsApp
function parseExpenseMessage(text) {
    try {
        const lines = text.split('\n');
        let data = {};

        lines.forEach(line => {
            const parts = line.split(':');
            if (parts.length >= 2) {
                const key = parts[0].trim().toLowerCase();
                const value = parts.slice(1).join(':').trim();

                if (key.includes('item')) data.item = value;
                if (key.includes('valor')) data.valor = parseFloat(value.replace('R$', '').trim().replace(',', '.'));
                if (key.includes('conta')) data.conta = value;
                if (key.includes('pagamento') || key.includes('meio')) data.pagamento = value;
            }
        });

        data.timestamp = new Date().toISOString();
        data.id = Date.now().toString(); // ID único para cada gasto

        return data;
    } catch (error) {
        console.error('Erro ao interpretar a mensagem:', error);
        return null;
    }
}

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    const sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        auth: state
    });

    sock.ev.on('creds.update', saveCreds);

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

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0];
        if (!m.message || m.key.fromMe) return;

        const messageText = m.message.conversation || m.message.extendedTextMessage?.text;
        if (!messageText) return;

        if (messageText.includes('*Controle de Gastos*')) {
            console.log('📥 Nova despesa detectada no chat!');
            
            const despesaProcessada = parseExpenseMessage(messageText);
            
            if (despesaProcessada && despesaProcessada.item) {
                salvarDespesa(despesaProcessada);
                
                await sock.sendMessage(m.key.remoteJid, { 
                    text: `✅ Gasto processado e salvo!\n📌 Item: ${despesaProcessada.item}\n💰 Valor: R$ ${despesaProcessada.valor || '0.00'}\n👤 Conta: ${despesaProcessada.conta || 'Não informada'}` 
                });
            } else {
                await sock.sendMessage(m.key.remoteJid, { 
                    text: `⚠️ Não consegui entender todos os campos. Verifique o formato do *Controle de Gastos*.` 
                });
            }
        }
    });
}

connectToWhatsApp();
