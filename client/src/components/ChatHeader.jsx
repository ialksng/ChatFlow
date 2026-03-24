import { X, Video, Phone, PenTool } from "lucide-react";
import { useAuthStore } from "../store/useAuthStore";
import { useChatStore } from "../store/useChatStore";
import { useCallStore } from "../store/useCallStore"; 

const ChatHeader = () => {
  const { selectedUser, setSelectedUser } = useChatStore();
  const { onlineUsers } = useAuthStore();
  const { initiateCall } = useCallStore();

  const BOT_EMAIL = "ai@chatflow.com"; 
  const isOnline = onlineUsers.includes(selectedUser?._id) || selectedUser?.email === BOT_EMAIL;

  if (!selectedUser) return null;

  return (
    <div className="p-2.5 border-b border-base-300">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="avatar">
            <div className="size-10 rounded-full relative">
              <img src={selectedUser.profilePic || "/avatar.png"} alt={selectedUser.fullName} />
            </div>
          </div>
          <div>
            <h3 className="font-medium">{selectedUser.fullName}</h3>
            <p className="text-sm text-base-content/70">
              {isOnline ? "Online" : "Offline"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
  
          {selectedUser.email !== BOT_EMAIL && (
            <>
              <button 
                className="text-base-content/70 hover:text-primary transition-colors tooltip tooltip-bottom" 
                data-tip="Draw Together"
                onClick={() => initiateCall("draw")}
              >
                <PenTool className="size-5" />
              </button>
              <button 
                className="text-base-content/70 hover:text-primary transition-colors tooltip tooltip-bottom" 
                data-tip="Audio Call"
                onClick={() => initiateCall("audio")}
              >
                <Phone className="size-5" />
              </button>
              <button 
                className="text-base-content/70 hover:text-primary transition-colors tooltip tooltip-bottom" 
                data-tip="Video & Screen Share"
                onClick={() => initiateCall("video")}
              >
                <Video className="size-5" />
              </button>
            </>
          )}

          <button onClick={() => setSelectedUser(null)} className="ml-4">
            <X className="size-5" />
          </button>
        </div>
      </div>
    </div>
  );
};
export default ChatHeader;