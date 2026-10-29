import app from './app.js';
const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '0.0.0.0';
app.listen(PORT, HOST, () => {
    console.log(`Servidor escutando em ${HOST}:${PORT}`);
});
