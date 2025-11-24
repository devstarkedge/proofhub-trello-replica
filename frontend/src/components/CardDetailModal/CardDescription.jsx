import React, { useState, useEffect } from "react";
import { AlignLeft } from "lucide-react";
import RichTextEditor from "../RichTextEditor";
import { motion } from "framer-motion";

const CardDescription = ({ description, teamMembers, onChange, onImageUpload }) => {
  const [isEditing, setIsEditing] = useState(false);

  // If description is empty, start in editing mode.
  useEffect(() => {
    if (!description) {
      setIsEditing(true);
    }
  }, [description]);

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
        {isEditing && (
          <button
            onClick={() => setIsEditing(false)}
            className="text-sm text-blue-600 hover:underline ml-auto"
          >
            Done
          </button>
        )}
      </div>

      <div className="ml-8 relative">
        {isEditing ? (
          <div className="border border-gray-300 rounded-lg overflow-hidden hover:border-gray-400 transition-colors shadow-sm hover:shadow-md">
            <RichTextEditor
              content={description}
              onChange={onChange}
              placeholder="Add a more detailed description..."
              users={teamMembers}
              onImageUpload={onImageUpload}
              className="prose-img:max-w-full prose-img:h-auto prose-img:rounded-lg"
              startExpanded={true} // Keep it expanded in editing mode
            />
          </div>
        ) : (
          <div
            onClick={() => setIsEditing(true)}
            className="p-4 bg-white rounded-lg cursor-pointer hover:bg-gray-50 min-h-[60px] border border-transparent hover:border-gray-200 transition-colors"
          >
            {description ? (
              <div
                className="prose prose-sm max-w-none text-gray-800"
                dangerouslySetInnerHTML={{ __html: description }}
              />
            ) : (
              <p className="text-gray-500">Add a more detailed description...</p>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default CardDescription;
