import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { abrirCatalogo } from '../admin/catalogo.js';
import { criarAdminComRespostas } from '../admin/criar-admin.js';

const redefinir = process.argv.includes('--redefinir');

const ROTULOS = redefinir
    ? ['Usuário do admin: ', 'Senha (o terminal mostra o que é digitado): ']
    : [
          'Usuário do admin: ',
          'Senha (o terminal mostra o que é digitado): ',
          'Nome: ',
          'Email: ',
      ];

// Em terminal de verdade, pergunta uma a uma. Em entrada canalizada, lê as
// linhas de uma vez, porque o readline do Node 22 não entrega a segunda
// resposta quando o stdin não é um TTY.
async function coletarRespostas() {
    if (!process.stdin.isTTY) {
        const linhas = readFileSync(0, 'utf8').split(/\r?\n/);
        return ROTULOS.map((_, i) => (linhas[i] ?? '').trim());
    }

    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
        const respostas = [];
        for (const rotulo of ROTULOS) respostas.push((await rl.question(rotulo)).trim());
        return respostas;
    } finally {
        rl.close();
    }
}

try {
    console.log(
        redefinir
            ? 'Redefinindo a senha de um admin existente.'
            : 'Criando o primeiro admin do catálogo.'
    );

    const [usuario, senha, nome, email] = await coletarRespostas();
    const respostas = redefinir ? { usuario, senha } : { usuario, senha, nome, email };

    const caminho = join(process.env.DADOS_DIR ?? 'dados', 'catalogo.db');
    const catalogo = abrirCatalogo(caminho);
    try {
        const resultado = criarAdminComRespostas({ catalogo, respostas, redefinir });
        if (resultado.erro) {
            console.error(`Erro: ${resultado.erro}`);
            process.exitCode = 1;
        } else {
            console.log(
                resultado.atualizado
                    ? 'Senha do admin redefinida. As sessões antigas foram revogadas.'
                    : 'Admin criado com sucesso.'
            );
        }
    } finally {
        catalogo.fechar();
    }
} catch (e) {
    console.error(`Erro: ${e.message}`);
    process.exitCode = 1;
}
