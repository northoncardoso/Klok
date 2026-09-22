import dotenv from 'dotenv';
import { criarBanco } from './db.js';
import { criarApp } from './app.js';

dotenv.config();

const banco = criarBanco();
const app = criarApp({ banco });

const porta = Number(process.env.PORT || 3000);
app.listen(porta, '0.0.0.0', () => {
    console.log(`API Klok rodando em http://0.0.0.0:${porta}`);
});