import jwt from "jsonwebtoken";

export const protectRoute = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    // Fallback to check cookies if standard Bearer token isn't present
    const token = authHeader && authHeader.startsWith("Bearer ") 
      ? authHeader.split(" ")[1] 
      : req.cookies?.jwt;

    if (!token) {
      return res.status(401).json({ message: "Unauthorized - No Token Provided" });
    }

    // Verify token locally using the project JWT secret
    const decoded = jwt.verify(token, process.env.SUPABASE_JWT_SECRET);
    
    if (!decoded) {
      return res.status(401).json({ message: "Unauthorized - Invalid Token" });
    }

    // Assign verified parameters natively into the Express request context
    req.user = {
      id: decoded.sub, // Supabase user UUID
      email: decoded.email,
    };

    next();
  } catch (error) {
    console.error("Error in protectRoute middleware: ", error.message);
    return res.status(401).json({ message: "Unauthorized - Token validation failed" });
  }
};