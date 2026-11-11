import { MINIMO_SENHA } from '../controladores/coordenadores.js';
import { PAPEL_COORDENADOR } from '../constantes.js';
import { codigoEmpresa, senha as senhaDe } from '../validacao.js';

// Escritas do painel de suporte. Como as consultas, elas abrem a empresa
// permitindo desativada e nunca criam banco ausente.
export function criarEscritasAdmin({ gerenciador, gerarTokenEmpresa, enviarEmail, registrar = console.log }) {
    function abrirParaAdmin(codigo) {
        return gerenciador.abrir(codigoEmpresa(codigo), {
            permitirDesativada: true,
            criarSeFaltar: false,
        });
    }

    function responderAbertura(res, aberta) {
        if (aberta.erro) {
            res.status(aberta.status).json({ erro: aberta.erro });
            return false;
        }
        return true;
    }

    // Só coordenador pode ser alvo: o painel nunca impersona funcionário, e
    // responder 404 evita confirmar que o id existe com outro papel.
    function coordenadorDaEmpresa(banco, id) {
        const usuario = banco.buscarUsuarioPorId(Number(id));
        return usuario && usuario.tipo === PAPEL_COORDENADOR ? usuario : null;
    }

    function redefinirSenhaCoordenador(req, res) {
        const aberta = abrirParaAdmin(req.params.codigo);
        if (!responderAbertura(res, aberta)) return;

        const coordenador = coordenadorDaEmpresa(aberta.banco, req.params.id);
        if (!coordenador) return res.status(404).json({ erro: 'Coordenador não encontrado' });

        const senha = senhaDe(req.body?.senha);
        if (senha.length < MINIMO_SENHA) {
            return res.status(400).json({
                erro: `A senha do coordenador deve ter ao menos ${MINIMO_SENHA} caracteres`,
            });
        }

        // atualizarSenha sobe a senhaVersao, então os tokens antigos do
        // coordenador caem no próximo pedido.
        aberta.banco.atualizarSenha(coordenador.id, aberta.banco.criarHashSenha(senha));
        res.status(204).end();
    }

    async function impersonarCoordenador(req, res) {
        const aberta = abrirParaAdmin(req.params.codigo);
        if (!responderAbertura(res, aberta)) return;

        const coordenador = coordenadorDaEmpresa(aberta.banco, req.params.id);
        if (!coordenador) return res.status(404).json({ erro: 'Coordenador não encontrado' });

        const token = await gerarTokenEmpresa(coordenador, aberta.empresa.codigo);
        registrar(
            `[klok] admin ${req.admin?.usuario ?? '?'} impersonou ${coordenador.usuario} na empresa ${aberta.empresa.codigo}`
        );
        res.json({
            token,
            empresa: aberta.empresa.codigo,
            usuario: coordenador.usuario,
            tipo: coordenador.tipo,
            // Mesmo prazo do token de empresa gerado no login.
            expiraEmHoras: 12,
        });
    }

    return { redefinirSenhaCoordenador, impersonarCoordenador };
}
