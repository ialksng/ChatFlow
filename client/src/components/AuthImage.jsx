import authImage from "../assets/auth-image.png";

const AuthImage = ({ title, subtitle }) => {
  return (
    <div className="hidden lg:flex items-center justify-center bg-base-200 p-12">
      <div className="max-w-md text-center">
        
        {/* IMAGE */}
        <div className="mb-8">
          <img
            src={authImage}
            alt="Auth Visual"
            className="w-full max-w-sm mx-auto rounded-2xl shadow-lg"
          />
        </div>

        <h2 className="text-2xl font-bold mb-4">{title}</h2>
        <p className="text-base-content/60">{subtitle}</p>
      </div>
    </div>
  );
};

export default AuthImage;