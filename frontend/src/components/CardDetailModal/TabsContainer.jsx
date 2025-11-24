import React from "react";
import { motion } from "framer-motion";
import { MessageSquare, Activity } from "lucide-react";

const TabsContainer = ({ activeTab, onTabChange, tabs = [] }) => {
  const defaultTabs = [
    {
      id: "comments",
      label: "Comments",
      icon: MessageSquare,
      badge: tabs.find((t) => t.id === "comments")?.badge || 0,
    },
    {
      id: "activity",
      label: "Activity",
      icon: Activity,
      badge: tabs.find((t) => t.id === "activity")?.badge || 0,
    },
  ];

  const tabList = tabs.length > 0 ? tabs : defaultTabs;

  return (
    <div className="w-full">
      <div className="flex items-center gap-1 border-b border-gray-200 mb-4">
        {tabList.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <motion.button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`
                flex items-center gap-2 px-4 py-3 font-medium transition-all relative
                ${
                  isActive
                    ? "text-blue-600"
                    : "text-gray-600 hover:text-gray-800 hover:bg-gray-50"
                }
              `}
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.98 }}
            >
              <Icon size={18} />
              <span>{tab.label}</span>

              {/* Badge */}
              {tab.badge > 0 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="inline-flex items-center justify-center w-5 h-5 text-xs font-semibold text-white bg-blue-600 rounded-full"
                >
                  {tab.badge > 99 ? "99+" : tab.badge}
                </motion.span>
              )}

              {/* Active indicator */}
              {isActive && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-600 to-blue-400"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3 }}
                />
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
};

export default TabsContainer;
