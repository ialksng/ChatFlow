import { useEffect, useState } from "react";
import { useChatStore, INDRA_AI_ID } from "../store/useChatStore";
import { useAuthStore } from "../store/useAuthStore";
import SidebarSkeleton from "./skeletons/SidebarSkeleton";
import { Users, Bot } from "lucide-react";

const Sidebar = () => {
  const { getUsers, users, selectedUser, setSelectedUser, isUsersLoading } = useChatStore();
  const { onlineUsers } = useAuthStore();
  const [showOnlineOnly, setShowOnlineOnly] = useState(false);

  useEffect(() => {
    getUsers();
  }, [getUsers]);

  // 1. Filter safely, ALWAYS keep Indra AI visible
  const filteredUsers = showOnlineOnly
    ? (users || []).filter((user) => {
        const uId = user.id || user._id;
        return onlineUsers.includes(uId) || uId === INDRA_AI_ID;
      })
    : (users || []);

  // 2. Pin Indra AI to the top based on the UUID
  const sortedUsers = [...filteredUsers].sort((a, b) => {
    const aId = a.id || a._id;
    const bId = b.id || b._id;
    if (aId === INDRA_AI_ID) return -1;
    if (bId === INDRA_AI_ID) return 1;
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
        </div>
      </div>

      <div className="overflow-y-auto w-full py-3">
        {sortedUsers.map((user) => {
          const uId = user.id || user._id;
          const isSelected = (selectedUser?.id || selectedUser?._id) === uId;
          const isAi = uId === INDRA_AI_ID;
          const isOnline = onlineUsers.includes(uId);

          return (
            <button
              key={uId}
              onClick={() => setSelectedUser(user)}
              className={`
                w-full p-3 flex items-center gap-3
                hover:bg-base-300 transition-colors
                ${isSelected ? "bg-base-300 ring-1 ring-base-300" : ""}
              `}
            >
              <div className="relative mx-auto lg:mx-0">
                <img
                  src={user.profilePic || `${import.meta.env.BASE_URL}avatar.png`}
                  alt={user.fullName}
                  className="size-12 object-cover rounded-full"
                />
                {(isAi || isOnline) && (
                  <span
                    className="absolute bottom-0 right-0 size-3 bg-green-500 
                    rounded-full ring-2 ring-zinc-900"
                  />
                )}
              </div>

              <div className="hidden lg:block text-left min-w-0 flex-1">
                <div className="font-medium truncate flex items-center gap-1">
                  {user.fullName}
                  {isAi && <Bot className="size-4 text-primary" />}
                </div>
                <div className="text-sm text-zinc-400">
                  {isAi ? "Always Online" : isOnline ? "Online" : "Offline"}
                </div>
              </div>
            </button>
          );
        })}

        {sortedUsers.length === 0 && (
          <div className="text-center text-zinc-500 py-4">No contacts found</div>
        )}
      </div>
    </aside>
  );
};
export default Sidebar;