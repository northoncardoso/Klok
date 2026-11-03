import { join } from 'node:path';
import dotenv from 'dotenv';
import { abrirCatalogo } from './admin/catalogo.js';
import { criarGerenciador } from './admin/gerenciador-bancos.js';
import { criarApp } from './app.js';

dotenv.config();

if (
    process.env.NODE_ENV === 'production' &&
    !(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
) {
    console.warn(
        '[klok] NODE_ENV=production sem SMTP configurado. A recuperação de senha por email vai falhar em produção.'
    );
}

const dadosDir = process.env.DADOS_DIR ?? 'dados';
const catalogo = abrirCatalogo(join(dadosDir, 'catalogo.db'));
const gerenciador = criarGerenciador({ catalogo, dadosDir });
const app = criarApp({ gerenciador, catalogo });

const porta = Number(process.env.PORT || 3000);
app.listen(porta, '0.0.0.0', () => {
    console.log(`API Klok rodando em http://0.0.0.0:${porta}`);
});
