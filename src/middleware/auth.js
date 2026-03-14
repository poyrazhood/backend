import jwt from 'jsonwebtoken';

export async function authenticate(request, reply) {
  try {
    const authHeader = request.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.code(401).send({ 
        message: 'Authorization token is missing or malformed' 
      });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Attach user payload to request
    request.user = decoded;
  } catch (error) {
    request.log.error(error);
    return reply.code(401).send({ 
      message: 'Invalid or expired token' 
    });
  }
}
