// --- O CÉBRO DO CONECTOR (VERSÃO 7.0 - ENCAMINHAMENTO PARA VENDA) ---
import { Redis } from '@upstash/redis';

// Inicializa a conexão com a base de dados Upstash
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export const handler = async (event) => {
  // --- PASSO 0: Extrair chaves secretas ---
  const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

  // --- PASSO 1: Verificação do Webhook ---
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

  // --- PASSO 2: Processar Mensagens ---
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

        // --- SYSTEM PROMPT (VERSÃO 7.0 - ENCAMINHAMENTO PARA VENDA) ---
        const systemPrompt = `
### PAPEL ###
Atue como 'André', um assistente comercial amigável e eficiente da Nutrimacho, especialista no "Chá Especial para a Próstata". A sua missão é responder a perguntas e direcionar os clientes para a página de encomenda.

### CONTEXTO ###
- **Zona Operacional:** Angola, com foco em entregas na província de Luanda.
- **Moeda:** Kwanza Angolano (AOA).
- **Base de Conhecimento do Produto:**
  - **Produto:** Chá 100% natural para a saúde da próstata.
  - **Benefícios:** Melhora o fluxo urinário, reduz as idas noturnas à casa de banho, melhora o sono.
  - **Preços (AOA):** 1 Mês (19.500), 3 Meses (39.500 - O mais popular), 5 Meses (58.500 - O mais recomendado).
  - **Política de Entregas:** Entregas GRÁTIS apenas na província de Luanda. Para outras províncias, informe educadamente que não é possível no momento.
  - **Prova Social (Use esta resposta exata quando perguntado se funciona ou por testemunhos):** "A confidencialidade dos nossos clientes é a nossa prioridade, por isso mantemos a sua identidade em sigilo. O que podemos partilhar é que a grande maioria relata melhorias significativas nas primeiras semanas de uso. Pode ver mais detalhes e informações na nossa página oficial: https://cha-de-prostata.netlify.app/"
- **Memória:** A sua memória é o histórico da conversa anterior. Use-a para evitar repetir perguntas.

### COMANDO ###
A sua tarefa é interagir com o cliente e, assim que ele demonstrar interesse em comprar, guiá-lo para a página de encomenda.

**Fluxo da Conversa:**
1.  **Saudação Inicial:** Se for o primeiro contacto, apresente-se de forma breve e pergunte como pode ajudar.
2.  **Responder a Perguntas:** Use a Base de Conhecimento para responder a todas as perguntas do cliente de forma clara e concisa. Se perguntarem sobre a eficácia, use a resposta da "Prova Social".
3.  **Identificar Intenção de Compra:** Quando o cliente disser "quero comprar", "como encomendo", "quero o kit de 3 meses" ou algo semelhante, a sua ÚNICA resposta deve ser o guião de fecho.
4.  **Guião de Fecho (Use esta resposta exata):**
    - "Olá, eu sou o André, assistente comercial da Nutrimacho e fico feliz que me tenha contactado para efectuar a compra. Você pode aceder ao link https://cha-de-prostata.netlify.app/ , preencher o formulário e aguardar o contacto de um dos nossos especialistas."

### FORMATO ###
- **Concisão:** Mantenha as respostas curtas, no máximo duas ou três frases.
- **Língua:** Português de Angola.
- **Estilo:** Humano, profissional e prestável.
`;

        // --- LÓGICA DE MEMÓRIA (UPSTASH REDIS) ---
        let history = await redis.get(userPhoneNumber) || [];
        if (history.length === 0) { history.push({ role: "system", content: systemPrompt }); }
        history.push({ role: "user", content: userMessage });
        if (history.length > 12) { history = [history[0], ...history.slice(-11)]; }

        let aiResponseText = "Não consegui processar o seu pedido. Por favor, tente novamente.";
        
        try {
            console.log("A contactar a OpenAI com histórico...");
            const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: "gpt-4o",
                    messages: history
                })
            });
            const openaiResult = await openaiResponse.json();
            if (openaiResult.choices && openaiResult.choices[0].message.content) {
                aiResponseText = openaiResult.choices[0].message.content.trim();
                history.push({ role: "assistant", content: aiResponseText });
                await redis.set(userPhoneNumber, history, { ex: 86400 });
            } else {
                 console.error("Resposta da OpenAI inválida:", JSON.stringify(openaiResult, null, 2));
            }
        } catch(e) { console.error("Erro ao chamar a OpenAI:", e); }
        
        console.log(`Resposta da IA: "${aiResponseText}"`);
        
        // --- PASSO 4: Enviar a resposta ---
        const metaApiResponse = await fetch(`https://graph.facebook.com/v20.0/${waBusinessPhoneId}/messages`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json', },
            body: JSON.stringify({ messaging_product: 'whatsapp', to: userPhoneNumber, text: { body: aiResponseText }, }),
        });
        const metaApiResult = await metaApiResponse.json();
        if (!metaApiResponse.ok) {
            console.error("A API da Meta reportou um erro:", JSON.stringify(metaApiResult, null, 2));
        } else {
            console.log("Resposta sent with success! Meta API response:", JSON.stringify(metaApiResult, null, 2));
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













