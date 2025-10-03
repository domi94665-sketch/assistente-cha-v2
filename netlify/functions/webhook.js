// --- O CÉBRO DO CONECTOR (VERSÃO 4.0 - COM MEMÓRIA EXTERNA UPSTASH) ---
import { Redis } from '@upstash/redis';

// Inicializa a conexão com a base de dados Upstash
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export const handler = async (event) => {
  // --- PASSO 0: Extrair chaves secretas (sem alterações) ---
  const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
  const GROQ_API_KEY = process.env.GROQ_API_KEY;

  // --- PASSO 1: Verificação do Webhook (sem alterações) ---
  if (event.httpMethod === 'GET') {
    const queryParams = event.queryStringParameters;
    const mode = queryParams['hub.mode'];
    const challenge = queryParams['hub.challenge'];
    const token = queryParams['hub.verify_token'];
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      return { statusCode: 200, body: challenge };
    } else {
      return { statusCode: 403, body: 'Falha na verificação' };
    }
  }

  // --- PASSO 2: Processar Mensagens (sem alterações na estrutura inicial) ---
  if (event.httpMethod === 'POST') {
    try {
      const body = JSON.parse(event.body);
      if (body.object === 'whatsapp_business_account' && body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
        const message = body.entry[0].changes[0].value.messages[0];
        if (message.type !== 'text') {
            return { statusCode: 200, body: 'OK' };
        }
        const userPhoneNumber = message.from;
        const userMessage = message.text.body;
        const waBusinessPhoneId = body.entry[0].changes[0].value.metadata.phone_number_id;
        console.log(`Mensagem recebida de ${userPhoneNumber}: "${userMessage}"`);

        // --- SYSTEM PROMPT (sem alterações) ---
        const systemPrompt = `
Você é um assistente de vendas para o "Chá Especial para a Próstata". A sua única missão é fechar vendas.
**DIRETIVA PRINCIPAL: SEJA UM VENDEDOR, NÃO UM CHATBOT.**
- A sua memória é a conversa anterior. Use-a para entender o contexto.
- Cada resposta sua deve ter um objetivo: levar o cliente para o próximo passo da encomenda.
- **NÃO FAÇA PERGUNTAS ABERTAS.** Em vez de "Como posso ajudar?", pergunte "Está pronto para escolher o seu kit?".
- **SEJA EXTREMAMENTE CONCISO.** Responda em uma, no máximo duas frases.
- **ASSUMA A VENDA.** Seja confiante.
**PROCESSO DE VENDA (Siga à risca):**
1. **Qualificação Rápida:** Responda e imediatamente avance para a encomenda.
2. **Iniciar a Encomenda:** Peça o nome completo.
3. **Obter o Endereço:** Peça o endereço completo para entrega grátis.
4. **Fechar o Kit:** Sugira o kit de 3 meses e peça confirmação.
5. **Confirmação Final:** Confirme os 3 dados (Nome, Endereço, Kit).
**BASE DE CONHECIMENTO:**
- **Produto:** Chá 100% natural para saúde da próstata.
- **Benefícios:** Melhora fluxo urinário, reduz idas à casa de banho, melhora sono.
- **Preços (AOA):** 1 Mês (19.500), 3 Meses (39.500 - popular), 5 Meses (58.500 - recomendado).
- **Extras:** Entrega Grátis, Garantia de 90 dias.
`;

        // --- LÓGICA DE MEMÓRIA (UPSTASH REDIS) ---
        let history = await redis.get(userPhoneNumber) || [];
        
        if (history.length === 0) {
            history.push({ role: "system", content: systemPrompt });
        }
        
        history.push({ role: "user", content: userMessage });

        if (history.length > 10) {
            history = [history[0], ...history.slice(-9)];
        }

        let aiResponseText = "Não consegui processar o seu pedido. Por favor, tente novamente.";
        
        try {
            console.log("A contactar a Groq com histórico...");
            const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: "llama-3.1-8b-instant",
                    messages: history
                })
            });
            const groqResult = await groqResponse.json();
            if (groqResult.choices && groqResult.choices[0].message.content) {
                aiResponseText = groqResult.choices[0].message.content.trim();
                history.push({ role: "assistant", content: aiResponseText });
                // Salva o histórico na Upstash com um tempo de expiração de 24 horas (86400 segundos)
                await redis.set(userPhoneNumber, history, { ex: 86400 });
            } else {
                 console.error("Resposta da Groq inválida:", JSON.stringify(groqResult, null, 2));
            }
        } catch(e) { console.error("Erro ao chamar a Groq:", e); }
        
        console.log(`Resposta da IA: "${aiResponseText}"`);
        
        // --- PASSO 4: Enviar a resposta (sem alterações) ---
        const metaApiResponse = await fetch(`https://graph.facebook.com/v20.0/${waBusinessPhoneId}/messages`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json', },
            body: JSON.stringify({ messaging_product: 'whatsapp', to: userPhoneNumber, text: { body: aiResponseText }, }),
        });
        const metaApiResult = await metaApiResponse.json();
        if (!metaApiResponse.ok) {
            console.error("A API da Meta reportou um erro:", JSON.stringify(metaApiResult, null, 2));
        } else {
            console.log("Resposta enviada com sucesso! Resposta da Meta:", JSON.stringify(metaApiResult, null, 2));
        }
        return { statusCode: 200, body: 'OK' };
      } else {
        return { statusCode: 200, body: 'Evento ignorado' };
      }
    } catch (error) {
      console.error('Erro no processamento do webhook:', error);
      return { statusCode: 500, body: 'Erro interno' };
    }
  }
  return { statusCode: 405, body: 'Método não permitido' };
};











