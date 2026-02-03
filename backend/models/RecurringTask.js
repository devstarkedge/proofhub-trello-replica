import mongoose from 'mongoose';

const recurringTaskSchema = new mongoose.Schema({
  // Reference to the parent card/task
  card: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Card',
    required: true,
    index: true
  },
  // Reference to the board/project
  board: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Board',
    required: true,
    index: true
  },
  // User who created the recurrence
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Whether recurrence is active
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },

  // Schedule Type: daily, weekly, monthly, yearly, daysAfter, custom
  scheduleType: {
    type: String,
    enum: ['daily', 'weekly', 'monthly', 'yearly', 'daysAfter', 'custom'],
    required: true
  },

  // Daily options
  dailyOptions: {
    skipWeekends: {
      type: Boolean,
      default: false
    }
  },

  // Weekly options
  weeklyOptions: {
    // Days of the week: 0=Sunday, 1=Monday, ..., 6=Saturday
    daysOfWeek: [{
      type: Number,
      min: 0,
      max: 6
    }]
  },

  // Monthly options
  monthlyOptions: {
    type: {
      type: String,
      enum: ['sameDate', 'firstDay', 'lastDay', 'defaultDay'],
      default: 'sameDate'
    },
    // For 'sameDate': date of month (1-31)
    dayOfMonth: {
      type: Number,
      min: 1,
      max: 31
    },
    // For 'defaultDay': which week (1=first, 2=second, etc., -1=last)
    weekOfMonth: {
      type: Number
    },
    // For 'defaultDay': which day of week (0-6)
    dayOfWeek: {
      type: Number,
      min: 0,
      max: 6
    }
  },

  // Yearly options
  yearlyOptions: {
    month: {
      type: Number,
      min: 0,
      max: 11 // 0=January, 11=December
    },
    dayOfMonth: {
      type: Number,
      min: 1,
      max: 31
    }
  },

  // Days After Complete options
  daysAfterOptions: {
    days: {
      type: Number,
      min: 1,
      default: 1
    }
  },

  // Custom options
  customOptions: {
    // Repeat every X days
    repeatEveryDays: {
      type: Number,
      min: 1
    },
    // Specific days of week (0-6)
    daysOfWeek: [{
      type: Number,
      min: 0,
      max: 6
    }],
    // Weeks of month (1-5)
    weeksOfMonth: [{
      type: Number,
      min: 1,
      max: 5
    }],
    // Days of year (1-366)
    daysOfYear: [{
      type: Number,
      min: 1,
      max: 366
    }]
  },

  // Recur Behavior: whenComplete, whenDone, onSchedule
  recurBehavior: {
    type: String,
    enum: ['whenComplete', 'whenDone', 'onSchedule'],
    default: 'onSchedule'
  },

  // Task options
  taskOptions: {
    skipWeekends: {
      type: Boolean,
      default: false
    },
    // If true, creates new main task; if false, creates subtask (recommended)
    createNewTask: {
      type: Boolean,
      default: false
    }
  },

  // End conditions
  endCondition: {
    type: {
      type: String,
      enum: ['never', 'afterOccurrences', 'onDate'],
      default: 'never'
    },
    // Number of occurrences if type is 'afterOccurrences'
    occurrences: {
      type: Number,
      min: 1
    },
    // End date if type is 'onDate'
    endDate: {
      type: Date
    }
  },

  // Due date and time for the recurring task
  dueDate: {
    type: Date
  },
  dueTime: {
    type: String, // Format: "HH:mm"
    default: '23:00'
  },

  // Start date (optional, recurs same number of days before due date)
  startDate: {
    type: Date
  },
  startTime: {
    type: String // Format: "HH:mm"
  },

  // Timezone for the user
  timezone: {
    type: String,
    default: 'UTC'
  },

  // Template data for creating subtasks
  subtaskTemplate: {
    title: {
      type: String
    },
    description: {
      type: String
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical', null]
    },
    assignees: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    tags: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Label'
    }]
  },

  // Tracking
  nextOccurrence: {
    type: Date,
    index: true
  },
  lastOccurrence: {
    type: Date
  },
  completedOccurrences: {
    type: Number,
    default: 0
  },

  // Generated subtasks reference
  generatedSubtasks: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subtask'
  }]
}, {
  timestamps: true
});

// Indexes for efficient queries
recurringTaskSchema.index({ board: 1, isActive: 1 });
recurringTaskSchema.index({ card: 1, isActive: 1 });
recurringTaskSchema.index({ nextOccurrence: 1, isActive: 1 });
recurringTaskSchema.index({ createdBy: 1 });

// Calculate next occurrence based on schedule
recurringTaskSchema.methods.calculateNextOccurrence = function(fromDate = new Date()) {
  const now = fromDate;
  let nextDate = new Date(now);

  switch (this.scheduleType) {
    case 'daily':
      nextDate.setDate(nextDate.getDate() + 1);
      if (this.dailyOptions?.skipWeekends || this.taskOptions?.skipWeekends) {
        while (nextDate.getDay() === 0 || nextDate.getDay() === 6) {
          nextDate.setDate(nextDate.getDate() + 1);
        }
      }
      break;

    case 'weekly':
      const targetDays = this.weeklyOptions?.daysOfWeek || [];
      if (targetDays.length > 0) {
        let found = false;
        for (let i = 1; i <= 7 && !found; i++) {
          const checkDate = new Date(now);
          checkDate.setDate(checkDate.getDate() + i);
          if (targetDays.includes(checkDate.getDay())) {
            nextDate = checkDate;
            found = true;
          }
        }
      } else {
        nextDate.setDate(nextDate.getDate() + 7);
      }
      break;

    case 'monthly':
      const monthlyType = this.monthlyOptions?.type || 'sameDate';
      nextDate.setMonth(nextDate.getMonth() + 1);
      
      if (monthlyType === 'sameDate') {
        const targetDay = this.monthlyOptions?.dayOfMonth || now.getDate();
        nextDate.setDate(Math.min(targetDay, new Date(nextDate.getFullYear(), nextDate.getMonth() + 1, 0).getDate()));
      } else if (monthlyType === 'firstDay') {
        nextDate.setDate(1);
      } else if (monthlyType === 'lastDay') {
        nextDate = new Date(nextDate.getFullYear(), nextDate.getMonth() + 1, 0);
      } else if (monthlyType === 'defaultDay') {
        const targetWeek = this.monthlyOptions?.weekOfMonth || 1;
        const targetDayOfWeek = this.monthlyOptions?.dayOfWeek || 0;
        nextDate.setDate(1);
        
        // Find the first occurrence of the target day
        while (nextDate.getDay() !== targetDayOfWeek) {
          nextDate.setDate(nextDate.getDate() + 1);
        }
        
        // Add weeks
        if (targetWeek > 1) {
          nextDate.setDate(nextDate.getDate() + (targetWeek - 1) * 7);
        }
      }
      break;

    case 'yearly':
      nextDate.setFullYear(nextDate.getFullYear() + 1);
      if (this.yearlyOptions?.month !== undefined) {
        nextDate.setMonth(this.yearlyOptions.month);
      }
      if (this.yearlyOptions?.dayOfMonth) {
        nextDate.setDate(this.yearlyOptions.dayOfMonth);
      }
      break;

    case 'daysAfter':
      // This is calculated when task is completed, not scheduled
      nextDate.setDate(nextDate.getDate() + (this.daysAfterOptions?.days || 1));
      break;

    case 'custom':
      if (this.customOptions?.repeatEveryDays) {
        nextDate.setDate(nextDate.getDate() + this.customOptions.repeatEveryDays);
      }
      break;

    default:
      nextDate.setDate(nextDate.getDate() + 1);
  }

  // Apply skip weekends if needed
  if (this.taskOptions?.skipWeekends) {
    while (nextDate.getDay() === 0 || nextDate.getDay() === 6) {
      nextDate.setDate(nextDate.getDate() + 1);
    }
  }

  // Set time
  if (this.dueTime) {
    const [hours, minutes] = this.dueTime.split(':').map(Number);
    nextDate.setHours(hours, minutes, 0, 0);
  } else {
    nextDate.setHours(23, 0, 0, 0);
  }

  return nextDate;
};

// Check if recurrence should end
recurringTaskSchema.methods.shouldEnd = function() {
  const endType = this.endCondition?.type || 'never';
  
  if (endType === 'never') return false;
  
  if (endType === 'afterOccurrences') {
    return this.completedOccurrences >= (this.endCondition?.occurrences || 1);
  }
  
  if (endType === 'onDate') {
    return this.endCondition?.endDate && new Date() >= new Date(this.endCondition.endDate);
  }
  
  return false;
};

export default mongoose.model('RecurringTask', recurringTaskSchema);
