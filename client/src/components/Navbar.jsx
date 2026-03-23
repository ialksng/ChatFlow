import { Link } from "react-router-dom";
import { useAuthStore } from "../store/useAuthStore";
import { LogOut, Settings, User } from "lucide-react";
import logo from "../assets/logo-navbar.png";

const Navbar = () => {
  const { logout, authUser } = useAuthStore();

  return (
    <header className="fixed top-0 z-40 w-full border-b border-base-300 bg-base-100/80 backdrop-blur-lg">
      <div className="container mx-auto px-4 h-16">
        <div className="flex items-center justify-between h-full">

          {/* Logo */}
          <Link
            to="/"
            className="flex items-center hover:opacity-80 transition-all"
          >
            <img
              src={logo}
              alt="ChatFlow"
              className="h-16 w-auto object-contain"
            />
          </Link>

          {/* Right Side */}
          <div className="flex items-center gap-2">

            <Link
              to="/settings"
              className="btn btn-sm gap-2 transition-colors"
            >
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">Settings</span>
            </Link>

            {authUser && (
              <>
                <Link to="/profile" className="btn btn-sm gap-2">
                  <User className="size-5" />
                  <span className="hidden sm:inline">Profile</span>
                </Link>

                <button
                  onClick={logout}
                  className="btn btn-sm gap-2"
                >
                  <LogOut className="size-5" />
                  <span className="hidden sm:inline">Logout</span>
                </button>
              </>
            )}

          </div>
        </div>
      </div>
    </header>
  );
};

export default Navbar;