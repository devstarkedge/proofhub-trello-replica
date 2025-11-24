import React from "react";
import { AlignLeft } from "lucide-react";
import RichTextEditor from "../RichTextEditor";
import { motion } from "framer-motion";

const CardDescription = ({ description, teamMembers, onChange, onImageUpload }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
    >
      <div className="flex items-center gap-3 mb-3">
        <AlignLeft size={20} className="text-gray-600" />
        <h4 className="font-semibold text-gray-800 text-lg">
          Description
        </h4>
      </div>

      <div className="ml-8 relative">
        <div className="border border-gray-300 rounded-lg overflow-hidden hover:border-gray-400 transition-colors shadow-sm hover:shadow-md">
          <RichTextEditor
            content={description}
            onChange={onChange}
            placeholder="Add a more detailed description..."
            users={teamMembers}
            onImageUpload={onImageUpload}
            className="prose-img:max-w-full prose-img:h-auto prose-img:rounded-lg"
          />
        </div>
      </div>
    </motion.div>
  );
};

export default CardDescription;
