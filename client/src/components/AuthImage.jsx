import signupImage from "../assets/signup-image.png";
import loginImage from "../assets/login-image.png";

const AuthImage = ({ type }) => {
  const image = type === "signup" ? signupImage : loginImage;

  return (
    <div className="hidden lg:flex items-center justify-center bg-base-200 p-12">
      <div className="max-w-md text-center">
        
        {/* IMAGE */}
        <div className="mb-8">
          <img
            src={image}
            alt="Auth Visual"
            className="w-full max-w-sm mx-auto rounded-2xl shadow-lg"
          />
        </div>
      </div>
    </div>
  );
};

export default AuthImage;