const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Configuración de variables generales
const API_KEY = 'AIzaSyB81Say3Rar3j2kmvpAlLpbNB6UipQpGNs'; // Clave de la API de Google
const DELIVERY_FEE = 5000; // Costo de envío
const ESTIMATED_WAIT_TIME = 40; // Tiempo de espera estimado en minutos
const INACTIVITY_LIMIT = 3600000; // Tiempo de inactividad en ms (1 hora)

// Variables de configuración del menú, palabras clave y otras opciones
const menuImagePath = 'media/menu.jpeg'; // Ruta a la imagen del menú
const keywordsMenu = ["menu", "menú", "catalogo", "ordenar", "pedir", "productos"]; // Palabras clave para solicitar el menú
const instructions = `
    Eres un asistente de ventas de comida. Ayudas a los clientes a realizar pedidos, les das información del menú, 
    y calculas el costo total con un cargo de envío de ${DELIVERY_FEE} y un tiempo de espera estimado de ${ESTIMATED_WAIT_TIME} minutos.
    Pregunta si desean agregar propina y confirma el pedido. 
    Una vez confirmado, envía el resumen del pedido con detalles del costo, tiempo de entrega y cualquier personalización indicada.
`;
const menu = {
    "Entradas": {
        "Anillos de Cebolla": "Aros de cebolla con tártara y tocineta. Precio: $13,000",
        "Choricitos con Mela'o": "Chorizos HAMCHO con arepitas. Precio: $12,500",
        "Maduritos": "Maduritos rellenos de queso doble crema y cotija. Precio: $13,500",
    },
    "Hamburguesas": {
        "Clasicona": "Carne 160 g, lechuga, tomate, tocineta. Precio: $22,000",
        "Double Style": "Carne 160 g, pollo apanado, queso cheddar. Precio: $27,500",
    },
};

// Instancia del cliente de WhatsApp
const client = new Client({ authStrategy: new LocalAuth() });
const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Memoria caché para almacenar el contexto de la conversación por cliente
let conversationCache = {};

// Mostrar el código QR en la terminal
client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    console.log('Escanea el código QR con tu WhatsApp.');
});

// Confirmar cuando el cliente esté listo
client.on('ready', () => {
    console.log('El bot está listo para usar.');
});

// Manejar mensajes
client.on('message', async (message) => {
    const sender = message.from; // Número de teléfono del remitente
    const newMessage = message.body.toLowerCase(); // Mensaje recibido en minúsculas

    // Inicializar o actualizar historial del cliente
    if (!conversationCache[sender]) {
        conversationCache[sender] = { messages: [], lastActivity: Date.now(), sentMenuImage: false };
    }
    conversationCache[sender].lastActivity = Date.now();
    conversationCache[sender].messages.push(`Usuario: ${newMessage}`);

    if (conversationCache[sender].messages.length > 20) {
        conversationCache[sender].messages.shift();
    }

    // Construir prompt dinámico con el historial y las variables generales
    const conversationHistory = conversationCache[sender].messages.join('\n');
    const prompt = `
        ${instructions}

        Menú:
        ${Object.keys(menu).map(category => `${category}:\n${Object.entries(menu[category]).map(([name, description]) => `${name}: ${description}`).join('\n')}`).join('\n\n')}
        
        Historial de conversación hasta ahora:
        ${conversationHistory}
    `;

    // Verificar si el mensaje contiene alguna palabra clave de menú
    const menuRequested = keywordsMenu.some(keyword => newMessage.includes(keyword));

    // Manejar el caso de solicitud del menú
    if (menuRequested && !conversationCache[sender].sentMenuImage) {
        const media = MessageMedia.fromFilePath(menuImagePath);
        await client.sendMessage(sender, media);
        conversationCache[sender].sentMenuImage = true;
        return;
    }

    try {
        // Generar respuesta de la IA
        const result = await model.generateContent(prompt);
        const botReply = result.response.text();
        conversationCache[sender].messages.push(`Bot: ${botReply}`);
        message.reply(botReply);
    } catch (error) {
        console.error('Error al generar contenido:', error);
        message.reply('Lo siento, ocurrió un error al generar la respuesta.');
    }
});

// Limpiar caché tras tiempo de inactividad
setInterval(() => {
    const currentTime = Date.now();
    for (const sender in conversationCache) {
        if (currentTime - conversationCache[sender].lastActivity > INACTIVITY_LIMIT) {
            console.log(`Borrando caché para ${sender} por inactividad.`);
            delete conversationCache[sender];
        }
    }
}, 60000); // Verificar cada minuto

// Iniciar el cliente
client.initialize();
