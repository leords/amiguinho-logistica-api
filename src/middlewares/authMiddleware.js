// src/middlewares/authMiddleware.js
import jwt from 'jsonwebtoken';

/**
 * Middleware para validação do token JWT compartilhado com a API principal.
 * 
 * Regras:
 * 1. Verifica a presença do cabeçalho "Authorization: Bearer <token>".
 * 2. Valida a assinatura e expiração com process.env.JWT_SECRET.
 * 3. Injeta o payload decodificado em req.usuario, assegurando que req.usuario.id esteja preenchido.
 * 4. Não realiza chamadas HTTP externas nem consultas a banco de dados de usuários.
 */
export const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({
      sucesso: false,
      erro: 'Cabeçalho de autorização não fornecido.',
      codigo: 'TOKEN_NAO_FORNECIDO'
    });
  }

  // Espera formato "Bearer <token>"
  const partes = authHeader.split(' ');
  if (partes.length !== 2 || partes[0] !== 'Bearer') {
    return res.status(401).json({
      sucesso: false,
      erro: 'Formato do cabeçalho de autorização inválido. Use: Bearer <token>.',
      codigo: 'TOKEN_FORMATO_INVALIDO'
    });
  }

  const token = partes[1];
  const jwtSecret =
    process.env.JWT_SECRET && !process.env.JWT_SECRET.startsWith('http')
      ? process.env.JWT_SECRET
      : (process.env.JWT_SECRETA || 'chave_secreta_amiguinho');

  if (!jwtSecret) {
    console.error('[ERRO CRÍTICO] JWT_SECRET não configurado nas variáveis de ambiente.');
    return res.status(500).json({
      sucesso: false,
      erro: 'Configuração interna do servidor de autenticação pendente.',
      codigo: 'ERRO_CONFIGURACAO_JWT'
    });
  }

  try {
    const payload = jwt.verify(token, jwtSecret);

    // Mapeia o ID do usuário de forma flexível para acomodar padrões da API principal
    // (payload.id, payload.sub ou payload.usuarioId)
    const usuarioId = payload.id || payload.sub || payload.usuarioId;

    if (!usuarioId) {
      return res.status(401).json({
        sucesso: false,
        erro: 'Token não contém a identificação do usuário (id/sub).',
        codigo: 'TOKEN_SEM_USUARIO'
      });
    }

    req.usuario = {
      ...payload,
      id: String(usuarioId)
    };

    return next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        sucesso: false,
        erro: 'Token de autenticação expirado.',
        codigo: 'TOKEN_EXPIRADO'
      });
    }

    return res.status(401).json({
      sucesso: false,
      erro: 'Token de autenticação inválido.',
      codigo: 'TOKEN_INVALIDO'
    });
  }
};

/**
 * Middleware de autenticação opcional (para consultas de rotas e listagem do painel de monitoramento).
 * Se o token for enviado, valida e injeta req.usuario. Se não for enviado, segue sem bloquear.
 */
export const authOpcionalMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    req.usuario = null;
    return next();
  }

  const partes = authHeader.split(' ');
  if (partes.length !== 2 || partes[0] !== 'Bearer') {
    req.usuario = null;
    return next();
  }

  const token = partes[1];
  const jwtSecret =
    process.env.JWT_SECRET && !process.env.JWT_SECRET.startsWith('http')
      ? process.env.JWT_SECRET
      : (process.env.JWT_SECRETA || 'chave_secreta_amiguinho');

  try {
    const payload = jwt.verify(token, jwtSecret);
    const usuarioId = payload.id || payload.sub || payload.usuarioId;
    req.usuario = {
      ...payload,
      id: usuarioId ? String(usuarioId) : null
    };
  } catch (err) {
    req.usuario = null;
  }

  return next();
};

export default authMiddleware;
