import app from './app.js';
const PORT = Number(process.env.PORT) || 8080;
app.listen(PORT, '127.0.0.1', () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});
