import dotenv from 'dotenv';
import { criarBanco } from './db.js';
import { criarApp } from './app.js';

dotenv.config();

const banco = criarBanco();
const app = criarApp({ banco });

app.listen(3000, '0.0.0.0', () => {
    console.log('API Klok rodando em http://0.0.0.0:3000');
});