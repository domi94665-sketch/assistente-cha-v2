// --- O CÉBRO DO CONECTOR (VERSÃO 9.3 - DIAGNÓSTICO DE TOKEN) ---
import { Redis } from '@upstash/redis';
import fs from 'fs';
import path from 'path';

// Conexão com a memória Upstash
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// Carrega o dossier de inteligência do negócio
const dossierPath = path.resolve(process.cwd(), 'dossier_negocio.txt');
const DOSSIER_INTELIGENCIA = fs.readFileSync(dossierPath, 'utf-8');
const LINHA_DE_SUPORTE = "+244 9XX XXX XXX"; // Insira aqui o seu número de suporte real

export default async function handler(req, res) {
  // --- PASSO 0: Extrair chaves secretas ---
  const ZAPI_INSTANCE_ID = process.env.ZAPI_INSTANCE_ID;
  const ZAPI_TOKEN = process.env.ZAPI_TOKEN;
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

  // A Z-API só envia POSTs, então ignoramos outros métodos
  if (req.method !== 'POST') {
    return res.status(405).send('Método não permitido');
  }

  try {
    const body = req.body;
    
    // Verifica se é uma mensagem de texto válida da Z-API
    if (body.text && body.phone && !body.fromMe) {
      const userMessage = (typeof body.text === 'object' && body.text.message) ? body.text.message : body.text;
      const userPhoneNumber = body.phone;
      
      console.log(`Mensagem recebida de ${userPhoneNumber}: "${userMessage}"`);

      // --- LÓGICA DE MEMÓRIA E RECONHECIMENTO DE CLIENTE ---
      let userData = await redis.get(userPhoneNumber) || { status: 'NOVO_CLIENTE', history: [] };
      if (!Array.isArray(userData.history)) {
          userData.history = [];
      }
      const isNewClient = userData.status === 'NOVO_CLIENTE';

      // --- SYSTEM PROMPT (VENDEDOR AUTÓNOMO) ---
      const systemPrompt = `
### PAPEL ###
Atue como 'André', um assistente comercial autónomo, especialista e amigável da Nutrimacho. A sua missão é usar o dossier de inteligência fornecido para responder a todas as perguntas e guiar o cliente ativamente pelo funil de vendas até à página de encomenda.

### CONTEXTO ###
- **Estado do Cliente:** O cliente atual é ${isNewClient ? 'um novo contacto' : 'um cliente que retorna'}. Adapte o seu tom.
- **O Dossier de Inteligência:** Abaixo está todo o seu conhecimento. Baseie TODAS as suas respostas estritamente nesta informação.

\`\`\`dossier
${DOSSIER_INTELIGENCIA}
\`\`\`

### COMANDO ###
A sua tarefa é analisar a mensagem do cliente e decidir a melhor ação:
1.  **Primeiro Contacto:** Apresente-se calorosamente e procure entender a necessidade do cliente.
2.  **Responder a Perguntas:** Se o cliente fizer uma pergunta, procure a resposta EXATA no dossier. Se a informação NÃO estiver no dossier, encaminhe para a linha de suporte: ${LINHA_DE_SUPORTE}.
3.  **Conduzir à Venda:** Se o cliente expressar interesse em comprar, use o "Guião de Compra" exato: "Fico feliz em ajudar com a sua encomenda! O processo é muito simples. Por favor, aceda à nossa página segura através do link https://cha-de-prostata.netlify.app/ , preencha o formulário, e um dos nossos especialistas entrará em contacto para finalizar os detalhes."

### FORMATO ###
- **Estilo:** Humano, profissional, confiante e prestável.
- **Língua:** Português de Angola, sem erros.
- **Formatação de Links:** Envie links como texto puro (https://...). NUNCA use o formato Markdown \`[texto](link)\`.
`;
      
      if (isNewClient) { userData.status = 'EM_CONVERSA'; }
      userData.history.push({ role: "user", content: userMessage });
      if (userData.history.length > 10) {
          userData.history = userData.history.slice(-10);
      }

      let aiResponseText = `Peço desculpa, mas estou com uma dificuldade técnica. Por favor, contacte o nosso suporte através do número ${LINHA_DE_SUPORTE} para assistência imediata.`;
      
      try {
        console.log("A contactar a OpenAI com contexto...");
        const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: "gpt-4o",
                messages: [{ role: "system", content: systemPrompt }, ...userData.history]
            })
        });
        const openaiResult = await openaiResponse.json();
        if (openaiResult.choices && openaiResult.choices[0].message.content) {
            aiResponseText = openaiResult.choices[0].message.content.trim();
            userData.history.push({ role: "assistant", content: aiResponseText });
            await redis.set(userPhoneNumber, userData, { ex: 86400 });
        } else {
             console.error("Resposta da OpenAI inválida:", JSON.stringify(openaiResult, null, 2));
        }
      } catch(e) { console.error("Erro ao chamar a OpenAI:", e); }
      
      console.log(`Resposta da IA: "${aiResponseText}"`);
      
      // --- PASSO 4: Enviar a resposta VIA Z-API ---
      // **INÍCIO DA NOVA LINHA DE DIAGNÓSTICO**
      const partialToken = ZAPI_TOKEN ? `${ZAPI_TOKEN.substring(0, 4)}...${ZAPI_TOKEN.substring(ZAPI_TOKEN.length - 4)}` : 'NÃO DEFINIDO';
      console.log(`VERIFICANDO CREDENCIAIS Z-API -> Instance ID: ${ZAPI_INSTANCE_ID} | Token Parcial: ${partialToken}`);
      // **FIM DA NOVA LINHA DE DIAGNÓSTICO**
      
      const zapiResponse = await fetch(`https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/send-text`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
              phone: userPhoneNumber,
              message: aiResponseText,
          }),
      });
      
      if (!zapiResponse.ok) {
          const errorResult = await zapiResponse.json();
          console.error("A Z-API reportou um erro:", JSON.stringify(errorResult, null, 2));
      } else {
          const successResult = await zapiResponse.json();
          console.log("Resposta enviada com sucesso via Z-API! Resposta:", JSON.stringify(successResult, null, 2));
      }
      
      res.status(200).send('OK');

    } else {
      res.status(200).send('Evento ignorado');
    }
  } catch (error) {
    console.error('Erro no processamento do webhook:', error);
    res.status(500).send('Erro interno');
  }
}






