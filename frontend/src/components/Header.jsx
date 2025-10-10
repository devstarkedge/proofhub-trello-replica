import React from 'react';
import { Share2, Star, Users, Menu } from 'lucide-react';

const Header = ({ boardName }) => {
  return (
    <header className="bg-black bg-opacity-20 backdrop-blur-sm px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-white text-lg font-semibold">{boardName}</h1>
          <button className="text-white hover:bg-gray-500 hover:bg-opacity-20 p-1.5 rounded transition-colors">
            <Star size={18} />
          </button>
        </div>
        
        <div className="flex items-center gap-2">
          <button className="text-white hover:bg-gray-500 hover:bg-opacity-20 p-2 rounded transition-colors">
            <Users size={18} />
          </button>
          <button className="text-white  bg-opacity-20 hover:bg-opacity-30 hover:bg-gray-500 px-4 py-1.5 rounded text-sm font-medium transition-colors flex items-center gap-2">
            <Share2 size={16} />
            Share
          </button>
          <button className="text-white hover:bg-gray-500 hover:bg-opacity-20 p-2 rounded transition-colors">
            <Menu size={18} />
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;