import { useEffect, useState } from "react";
import { useChatStore } from "../store/useChatStore";
import { useAuthStore } from "../store/useAuthStore";
import SidebarSkeleton from "./skeletons/SidebarSkeleton";
import { Users, Bot } from "lucide-react";

const Sidebar = () => {
  const { getUsers, users, selectedUser, setSelectedUser, isUsersLoading } = useChatStore();
  const { onlineUsers } = useAuthStore();
  const [showOnlineOnly, setShowOnlineOnly] = useState(false);

  // The exact email you used when creating the AI user in MongoDB
  const BOT_EMAIL = "ai@chatflow.com"; 

  useEffect(() => {
    getUsers();
  }, [getUsers]);

  // 1. Filter users, but ALWAYS keep the bot visible even if "Show online only" is checked
  const filteredUsers = showOnlineOnly
    ? users.filter((user) => onlineUsers.includes(user._id) || user.email === BOT_EMAIL)
    : users;

  // 2. Pin the bot to the top based on its EMAIL, not its name
  const sortedUsers = [...filteredUsers].sort((a, b) => {
    if (a.email === BOT_EMAIL) return -1;
    if (b.email === BOT_EMAIL) return 1;
    return 0;
  });

  if (isUsersLoading) return <SidebarSkeleton />;

  return (
    <aside className="h-full w-20 lg:w-72 border-r border-base-300 flex flex-col transition-all duration-200">
      <div className="border-b border-base-300 w-full p-5">
        <div className="flex items-center gap-2">
          <Users className="size-6" />
          <span className="font-medium hidden lg:block">Contacts</span>
        </div>
        <div className="mt-3 hidden lg:flex items-center gap-2">
          <label className="cursor-pointer flex items-center gap-2">
            <input
              type="checkbox"
              checked={showOnlineOnly}
              onChange={(e) => setShowOnlineOnly(e.target.checked)}
              className="checkbox checkbox-sm"
            />
            <span className="text-sm">Show online only</span>
          </label>
          <span className="text-xs text-zinc-500">({onlineUsers.length - 1} online)</span>
        </div>
      </div>

      <div className="overflow-y-auto w-full py-3">
        {sortedUsers.map((user) => (
          <button
            key={user._id}
            onClick={() => setSelectedUser(user)}
            className={`
              w-full p-3 flex items-center gap-3
              hover:bg-base-300 transition-colors
              ${selectedUser?._id === user._id ? "bg-base-300 ring-1 ring-base-300" : ""}
            `}
          >
            <div className="relative mx-auto lg:mx-0">
              <img
                src={user.profilePic || "/avatar.png"}
                alt={user.fullName}
                className="size-12 object-cover rounded-full"
              />
              {/* Force green dot if it's the bot */}
              {(user.email === BOT_EMAIL || onlineUsers.includes(user._id)) && (
                <span
                  className="absolute bottom-0 right-0 size-3 bg-green-500 
                  rounded-full ring-2 ring-zinc-900"
                />
              )}
            </div>

            {/* User info - only visible on larger screens */}
            <div className="hidden lg:block text-left min-w-0 flex-1">
              <div className="font-medium truncate flex items-center gap-1">
                {user.fullName}
                {/* Show Bot icon if it's the bot */}
                {user.email === BOT_EMAIL && <Bot className="size-4 text-primary" />}
              </div>
              <div className="text-sm text-zinc-400">
                {/* Force "Online" text for the bot */}
                {user.email === BOT_EMAIL ? "Always Online" : onlineUsers.includes(user._id) ? "Online" : "Offline"}
              </div>
            </div>
          </button>
        ))}

        {sortedUsers.length === 0 && (
          <div className="text-center text-zinc-500 py-4">No online users</div>
        )}
      </div>
    </aside>
  );
};
export default Sidebar;