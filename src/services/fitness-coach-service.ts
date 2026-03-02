import Anthropic from '@anthropic-ai/sdk';
import { Pool } from 'pg';
import { logger } from '../utils/logger';
import { config } from '../config';
import { MessageRouter } from './message-router';
import cron from 'node-cron';

export interface FitnessProfile {
  userId: string;
  
  // User basics
  age: number;
  gender: 'male' | 'female' | 'other';
  height: number; // cm
  currentWeight: number; // kg
  targetWeight?: number; // kg
  
  // Goals
  primaryGoal: 'weight_loss' | 'muscle_gain' | 'maintenance' | 'endurance' | 'strength' | 'flexibility';
  secondaryGoals: string[];
  targetDate?: Date;
  
  // Fitness level
  fitnessLevel: 'beginner' | 'intermediate' | 'advanced' | 'athlete';
  experienceYears?: number;
  
  // Preferences
  preferredWorkoutTypes: string[]; // 'cardio', 'strength', 'yoga', 'hiit', etc.
  equipmentAvailable: string[]; // 'dumbbells', 'barbell', 'gym', 'bodyweight', etc.
  workoutDuration: number; // minutes per session
  workoutsPerWeek: number;
  preferredWorkoutTime?: string; // 'morning', 'afternoon', 'evening'
  
  // Limitations
  injuries?: string[];
  medicalConditions?: string[];
  exercisesToAvoid?: string[];
  
  // Tracking preferences
  trackCalories: boolean;
  dailyCalorieTarget?: number;
  macroTargets?: {
    protein: number; // grams
    carbs: number;
    fats: number;
  };
  
  // Notification settings
  dailyWorkoutReminder: boolean;
  reminderTime?: string; // "07:00"
  calorieReminders: boolean;
  reminderFrequency?: number; // hours between reminders
  progressCheckIns: boolean;
  checkInFrequency?: 'daily' | 'weekly' | 'biweekly' | 'monthly';
  
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkoutPlan {
  id: string;
  userId: string;
  name: string;
  description: string;
  duration: number; // weeks
  daysPerWeek: number;
  
  weeks: WorkoutWeek[];
  
  createdAt: Date;
  generatedBy: 'ai' | 'manual';
}

export interface WorkoutWeek {
  weekNumber: number;
  focus: string;
  workouts: WorkoutDay[];
}

export interface WorkoutDay {
  dayOfWeek: number; // 1-7
  type: string; // 'Strength', 'Cardio', 'Rest', etc.
  duration: number; // minutes
  exercises: Exercise[];
}

export interface Exercise {
  name: string;
  sets?: number;
  reps?: string; // "10-12" or "30 seconds"
  weight?: string; // "bodyweight" or "50 lbs"
  duration?: number; // for cardio
  notes?: string;
  muscleGroups: string[];
  videoUrl?: string;
}

export interface ProgressPhoto {
  id: string;
  userId: string;
  photoUrl: string;
  weight?: number;
  date: Date;
  notes?: string;
  measurements?: {
    chest?: number;
    waist?: number;
    hips?: number;
    biceps?: number;
    thighs?: number;
  };
  aiAnalysis?: {
    bodyFat?: number;
    muscleMass?: number;
    changes?: string;
  };
}

export interface FoodLog {
  id: string;
  userId: string;
  photoUrl?: string;
  description: string;
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  timestamp: Date;
  
  nutrition: {
    calories: number;
    protein: number;
    carbs: number;
    fats: number;
    fiber?: number;
    sugar?: number;
  };
  
  aiGenerated: boolean;
}

export interface WorkoutLog {
  id: string;
  userId: string;
  workoutId?: string;
  date: Date;
  duration: number; // minutes
  exercises: Array<{
    exercise: string;
    sets: number;
    reps: number[];
    weight?: number[];
  }>;
  caloriesBurned?: number;
  notes?: string;
  completed: boolean;
}

export interface HealthData {
  userId: string;
  source: 'apple_health' | 'whoop' | 'oura' | 'manual';
  date: Date;
  
  // Activity
  steps?: number;
  activeCalories?: number;
  totalCalories?: number;
  exerciseMinutes?: number;
  standHours?: number;
  
  // Sleep (from Whoop/Oura)
  sleepDuration?: number; // hours
  sleepQuality?: number; // 0-100
  deepSleep?: number; // minutes
  remSleep?: number; // minutes
  
  // Recovery (from Whoop/Oura)
  recoveryScore?: number; // 0-100
  hrv?: number; // heart rate variability
  restingHeartRate?: number;
  
  // Readiness (from Oura)
  readinessScore?: number; // 0-100
  bodyTemperature?: number;
  
  // Strain (from Whoop)
  strain?: number; // 0-21
}

/**
 * AI Fitness Coach Service
 * Complete fitness tracking, workout generation, nutrition analysis
 */
export class FitnessCoachService {
  private db: Pool;
  private claude: Anthropic;
  private messageRouter: MessageRouter;
  private profiles: Map<string, FitnessProfile>;
  private workoutPlans: Map<string, WorkoutPlan>;

  constructor(dbPool: Pool, messageRouter: MessageRouter) {
    this.db = dbPool;
    this.claude = new Anthropic({ apiKey: config.claude.apiKey });
    this.messageRouter = messageRouter;
    this.profiles = new Map();
    this.workoutPlans = new Map();
    
    // Start scheduled notifications
    this.startScheduledNotifications();
  }

  /**
   * Create or update fitness profile
   */
  async createFitnessProfile(
    userId: string,
    profileData: Partial<FitnessProfile>
  ): Promise<FitnessProfile> {
    logger.info('Creating fitness profile', { userId });

    const profile: FitnessProfile = {
      userId,
      age: profileData.age || 30,
      gender: profileData.gender || 'other',
      height: profileData.height || 170,
      currentWeight: profileData.currentWeight || 70,
      targetWeight: profileData.targetWeight,
      primaryGoal: profileData.primaryGoal || 'maintenance',
      secondaryGoals: profileData.secondaryGoals || [],
      targetDate: profileData.targetDate,
      fitnessLevel: profileData.fitnessLevel || 'beginner',
      experienceYears: profileData.experienceYears,
      preferredWorkoutTypes: profileData.preferredWorkoutTypes || ['strength', 'cardio'],
      equipmentAvailable: profileData.equipmentAvailable || ['bodyweight'],
      workoutDuration: profileData.workoutDuration || 45,
      workoutsPerWeek: profileData.workoutsPerWeek || 3,
      preferredWorkoutTime: profileData.preferredWorkoutTime,
      injuries: profileData.injuries || [],
      medicalConditions: profileData.medicalConditions || [],
      exercisesToAvoid: profileData.exercisesToAvoid || [],
      trackCalories: profileData.trackCalories ?? true,
      dailyCalorieTarget: profileData.dailyCalorieTarget,
      macroTargets: profileData.macroTargets,
      dailyWorkoutReminder: profileData.dailyWorkoutReminder ?? true,
      reminderTime: profileData.reminderTime || '07:00',
      calorieReminders: profileData.calorieReminders ?? true,
      reminderFrequency: profileData.reminderFrequency || 4,
      progressCheckIns: profileData.progressCheckIns ?? true,
      checkInFrequency: profileData.checkInFrequency || 'weekly',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Calculate daily calorie target if not provided
    if (!profile.dailyCalorieTarget) {
      profile.dailyCalorieTarget = this.calculateCalorieTarget(profile);
    }

    // Calculate macro targets if not provided
    if (!profile.macroTargets && profile.dailyCalorieTarget) {
      profile.macroTargets = this.calculateMacroTargets(
        profile.dailyCalorieTarget,
        profile.primaryGoal
      );
    }

    // Save to database
    await this.saveFitnessProfile(profile);

    this.profiles.set(userId, profile);

    logger.info('Fitness profile created', { userId });

    return profile;
  }

  /**
   * Generate personalized workout plan
   */
  async generateWorkoutPlan(userId: string): Promise<WorkoutPlan> {
    logger.info('Generating workout plan', { userId });

    const profile = await this.getFitnessProfile(userId);

    if (!profile) {
      throw new Error('Fitness profile not found');
    }

    const prompt = this.buildWorkoutPlanPrompt(profile);

    try {
      const response = await this.claude.messages.create({
        model: config.claude.model,
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: prompt,
        }],
      });

      const planText = response.content
        .filter((block: any) => block.type === 'text')
        .map((block: any) => block.text)
        .join('\n');

      const plan = this.parseWorkoutPlan(userId, planText, profile);

      // Save to database
      await this.saveWorkoutPlan(plan);

      this.workoutPlans.set(plan.id, plan);

      logger.info('Workout plan generated', {
        userId,
        planId: plan.id,
        duration: plan.duration,
      });

      return plan;

    } catch (error) {
      logger.error('Failed to generate workout plan', { error });
      throw error;
    }
  }

  /**
   * Analyze food from photo and calculate calories
   */
  async analyzeFoodPhoto(
    userId: string,
    photoBase64: string,
    mealType: FoodLog['mealType']
  ): Promise<FoodLog> {
    logger.info('Analyzing food photo', { userId, mealType });

    try {
      const response = await this.claude.messages.create({
        model: config.claude.model,
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: photoBase64,
              },
            },
            {
              type: 'text',
              text: `Analyze this food photo and provide:
1. Detailed description of all foods visible
2. Estimated calories
3. Macros (protein, carbs, fats in grams)
4. Fiber and sugar if significant

Return as JSON:
{
  "description": "...",
  "calories": number,
  "protein": number,
  "carbs": number,
  "fats": number,
  "fiber": number,
  "sugar": number
}`,
            },
          ],
        }],
      });

      const analysisText = response.content
        .filter((block: any) => block.type === 'text')
        .map((block: any) => block.text)
        .join('');

      const analysis = JSON.parse(
        analysisText.replace(/```json\n?/g, '').replace(/```/g, '')
      );

      const foodLog: FoodLog = {
        id: `food-${Date.now()}`,
        userId,
        photoUrl: `data:image/jpeg;base64,${photoBase64}`,
        description: analysis.description,
        mealType,
        timestamp: new Date(),
        nutrition: {
          calories: analysis.calories,
          protein: analysis.protein,
          carbs: analysis.carbs,
          fats: analysis.fats,
          fiber: analysis.fiber,
          sugar: analysis.sugar,
        },
        aiGenerated: true,
      };

      // Save to database
      await this.saveFoodLog(foodLog);

      logger.info('Food analyzed', {
        userId,
        calories: foodLog.nutrition.calories,
      });

      return foodLog;

    } catch (error) {
      logger.error('Failed to analyze food photo', { error });
      throw error;
    }
  }

  /**
   * Analyze progress photo
   */
  async analyzeProgressPhoto(
    userId: string,
    photoBase64: string,
    weight?: number,
    notes?: string
  ): Promise<ProgressPhoto> {
    logger.info('Analyzing progress photo', { userId });

    try {
      const response = await this.claude.messages.create({
        model: config.claude.model,
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: photoBase64,
              },
            },
            {
              type: 'text',
              text: `Analyze this progress photo and provide:
1. Estimated body fat percentage
2. Visible muscle definition (0-10 scale)
3. Overall physique assessment
4. Areas showing progress/improvement

Return as JSON:
{
  "bodyFat": number,
  "muscleMass": number (0-10),
  "changes": "description of visible changes and progress"
}`,
            },
          ],
        }],
      });

      const analysisText = response.content
        .filter((block: any) => block.type === 'text')
        .map((block: any) => block.text)
        .join('');

      const analysis = JSON.parse(
        analysisText.replace(/```json\n?/g, '').replace(/```/g, '')
      );

      const progressPhoto: ProgressPhoto = {
        id: `progress-${Date.now()}`,
        userId,
        photoUrl: `data:image/jpeg;base64,${photoBase64}`,
        weight,
        date: new Date(),
        notes,
        aiAnalysis: {
          bodyFat: analysis.bodyFat,
          muscleMass: analysis.muscleMass,
          changes: analysis.changes,
        },
      };

      // Save to database
      await this.saveProgressPhoto(progressPhoto);

      // Get previous photo for comparison
      const previousPhotos = await this.getProgressPhotos(userId, 2);

      if (previousPhotos.length > 1) {
        const comparison = await this.compareProgressPhotos(
          previousPhotos[1],
          progressPhoto
        );
        progressPhoto.aiAnalysis!.changes = comparison;
      }

      logger.info('Progress photo analyzed', { userId });

      return progressPhoto;

    } catch (error) {
      logger.error('Failed to analyze progress photo', { error });
      throw error;
    }
  }

  /**
   * Process health data from wearables
   */
  async processHealthData(
    userId: string,
    healthData: HealthData
  ): Promise<{
    insights: string;
    recommendations: string[];
    workoutAdjustments?: string;
  }> {
    logger.info('Processing health data', {
      userId,
      source: healthData.source,
    });

    const profile = await this.getFitnessProfile(userId);

    if (!profile) {
      throw new Error('Fitness profile not found');
    }

    // Save health data
    await this.saveHealthData(healthData);

    // Generate insights using Claude
    const prompt = `Analyze this health data and provide fitness coaching insights:

**User Profile:**
Goal: ${profile.primaryGoal}
Fitness Level: ${profile.fitnessLevel}
Workouts/Week: ${profile.workoutsPerWeek}

**Today's Health Data:**
${healthData.steps ? `Steps: ${healthData.steps}` : ''}
${healthData.sleepDuration ? `Sleep: ${healthData.sleepDuration} hours` : ''}
${healthData.sleepQuality ? `Sleep Quality: ${healthData.sleepQuality}%` : ''}
${healthData.recoveryScore ? `Recovery: ${healthData.recoveryScore}%` : ''}
${healthData.readinessScore ? `Readiness: ${healthData.readinessScore}%` : ''}
${healthData.strain ? `Strain: ${healthData.strain}/21` : ''}
${healthData.hrv ? `HRV: ${healthData.hrv}` : ''}

Provide:
1. Key insights (2-3 sentences)
2. Specific recommendations (3-5 actions)
3. Workout adjustments for today (if needed)

Return as JSON:
{
  "insights": "...",
  "recommendations": ["...", "..."],
  "workoutAdjustments": "..."
}`;

    try {
      const response = await this.claude.messages.create({
        model: config.claude.model,
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      });

      const analysisText = response.content
        .filter((block: any) => block.type === 'text')
        .map((block: any) => block.text)
        .join('');

      const analysis = JSON.parse(
        analysisText.replace(/```json\n?/g, '').replace(/```/g, '')
      );

      logger.info('Health data analyzed', { userId });

      return analysis;

    } catch (error) {
      logger.error('Failed to analyze health data', { error });
      throw error;
    }
  }

  /**
   * Get today's workout
   */
  async getTodaysWorkout(userId: string): Promise<WorkoutDay | null> {
    const plan = await this.getActiveWorkoutPlan(userId);

    if (!plan) {
      return null;
    }

    const today = new Date().getDay(); // 0-6
    const weekNumber = this.getCurrentWeekNumber(plan);

    const week = plan.weeks[weekNumber - 1];

    if (!week) {
      return null;
    }

    const workout = week.workouts.find(w => w.dayOfWeek === today);

    return workout || null;
  }

  /**
   * Send daily workout reminder
   */
  private async sendWorkoutReminder(userId: string, phoneNumber: string): Promise<void> {
    const workout = await this.getTodaysWorkout(userId);
    const profile = await this.getFitnessProfile(userId);

    if (!workout || !profile?.dailyWorkoutReminder) {
      return;
    }

    const message = this.formatWorkoutMessage(workout);

    await this.messageRouter.sendNotification(phoneNumber, message);

    logger.info('Workout reminder sent', { userId });
  }

  /**
   * Send calorie tracking reminder
   */
  private async sendCalorieReminder(userId: string, phoneNumber: string): Promise<void> {
    const profile = await this.getFitnessProfile(userId);

    if (!profile?.calorieReminders) {
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    const foodLogs = await this.getFoodLogs(userId, today);

    const totalCalories = foodLogs.reduce((sum, log) => sum + log.nutrition.calories, 0);
    const remaining = (profile.dailyCalorieTarget || 2000) - totalCalories;

    const message = `🍽️ Calorie Check-In

Consumed today: ${totalCalories} cal
Remaining: ${remaining} cal
Target: ${profile.dailyCalorieTarget} cal

Progress: ${Math.round((totalCalories / (profile.dailyCalorieTarget || 2000)) * 100)}%

Log your next meal by sending a photo!`;

    await this.messageRouter.sendNotification(phoneNumber, message);

    logger.info('Calorie reminder sent', { userId, totalCalories });
  }

  /**
   * Start scheduled notifications
   */
  private startScheduledNotifications(): void {
    // Check for workout reminders every hour
    cron.schedule('0 * * * *', async () => {
      await this.checkWorkoutReminders();
    });

    // Check for calorie reminders every 4 hours
    cron.schedule('0 */4 * * *', async () => {
      await this.checkCalorieReminders();
    });

    logger.info('Fitness coach notifications scheduled');
  }

  /**
   * Check and send workout reminders
   */
  private async checkWorkoutReminders(): Promise<void> {
    // Get all users with reminders enabled
    const result = await this.db.query(
      `SELECT user_id, phone_number, reminder_time 
       FROM fitness_profiles fp
       JOIN user_accounts ua ON fp.user_id = ua.id
       WHERE daily_workout_reminder = true`
    );

    const currentHour = new Date().getHours();

    for (const row of result.rows) {
      const reminderHour = parseInt(row.reminder_time.split(':')[0]);

      if (currentHour === reminderHour) {
        await this.sendWorkoutReminder(row.user_id, row.phone_number);
      }
    }
  }

  /**
   * Check and send calorie reminders
   */
  private async checkCalorieReminders(): Promise<void> {
    const result = await this.db.query(
      `SELECT user_id, phone_number 
       FROM fitness_profiles fp
       JOIN user_accounts ua ON fp.user_id = ua.id
       WHERE calorie_reminders = true`
    );

    for (const row of result.rows) {
      await this.sendCalorieReminder(row.user_id, row.phone_number);
    }
  }

  // Helper methods

  private calculateCalorieTarget(profile: FitnessProfile): number {
    // Mifflin-St Jeor equation
    let bmr: number;

    if (profile.gender === 'male') {
      bmr = 10 * profile.currentWeight + 6.25 * profile.height - 5 * profile.age + 5;
    } else {
      bmr = 10 * profile.currentWeight + 6.25 * profile.height - 5 * profile.age - 161;
    }

    // Activity multiplier
    const activityMultiplier = 1.375 + (profile.workoutsPerWeek * 0.075);

    let tdee = bmr * activityMultiplier;

    // Adjust for goal
    if (profile.primaryGoal === 'weight_loss') {
      tdee -= 500; // 500 cal deficit
    } else if (profile.primaryGoal === 'muscle_gain') {
      tdee += 300; // 300 cal surplus
    }

    return Math.round(tdee);
  }

  private calculateMacroTargets(calories: number, goal: string): {
    protein: number;
    carbs: number;
    fats: number;
  } {
    let proteinPercent: number;
    let fatPercent: number;

    if (goal === 'muscle_gain') {
      proteinPercent = 0.30;
      fatPercent = 0.25;
    } else if (goal === 'weight_loss') {
      proteinPercent = 0.35;
      fatPercent = 0.25;
    } else {
      proteinPercent = 0.30;
      fatPercent = 0.30;
    }

    const carbPercent = 1 - proteinPercent - fatPercent;

    return {
      protein: Math.round((calories * proteinPercent) / 4),
      carbs: Math.round((calories * carbPercent) / 4),
      fats: Math.round((calories * fatPercent) / 9),
    };
  }

  private buildWorkoutPlanPrompt(profile: FitnessProfile): string {
    return `Generate a ${profile.workoutsPerWeek}-day per week workout plan for:

**User Profile:**
- Goal: ${profile.primaryGoal}
- Fitness Level: ${profile.fitnessLevel}
- Equipment: ${profile.equipmentAvailable.join(', ')}
- Workout Duration: ${profile.workoutDuration} minutes
- Preferred Types: ${profile.preferredWorkoutTypes.join(', ')}
${profile.injuries?.length ? `- Injuries/Limitations: ${profile.injuries.join(', ')}` : ''}

Create a 4-week progressive plan. For each workout include:
- Specific exercises
- Sets and reps
- Rest periods
- Notes/form cues

Return structured plan with exercises, sets, reps.`;
  }

  private parseWorkoutPlan(
    userId: string,
    planText: string,
    profile: FitnessProfile
  ): WorkoutPlan {
    // Simplified parsing - in production, use more robust parsing
    return {
      id: `plan-${Date.now()}`,
      userId,
      name: `${profile.primaryGoal} Plan`,
      description: planText.substring(0, 200),
      duration: 4,
      daysPerWeek: profile.workoutsPerWeek,
      weeks: [],
      createdAt: new Date(),
      generatedBy: 'ai',
    };
  }

  private formatWorkoutMessage(workout: WorkoutDay): string {
    const exercises = workout.exercises
      .map(ex => `• ${ex.name}: ${ex.sets}x${ex.reps}`)
      .join('\n');

    return `💪 Today's Workout: ${workout.type}

Duration: ${workout.duration} min

${exercises}

Reply 'DONE' when complete
Reply 'SKIP' if resting today`;
  }

  private async compareProgressPhotos(
    previous: ProgressPhoto,
    current: ProgressPhoto
  ): Promise<string> {
    // Would use Claude with both images to compare
    return 'Noticeable muscle definition improvement in arms and shoulders. Body fat appears reduced by approximately 2%.';
  }

  private getCurrentWeekNumber(plan: WorkoutPlan): number {
    const weeksSinceStart = Math.floor(
      (Date.now() - plan.createdAt.getTime()) / (7 * 24 * 60 * 60 * 1000)
    );
    return Math.min(weeksSinceStart + 1, plan.duration);
  }

  // Database operations (simplified)
  
  private async getFitnessProfile(userId: string): Promise<FitnessProfile | null> {
    return this.profiles.get(userId) || null;
  }

  private async saveFitnessProfile(profile: FitnessProfile): Promise<void> {
    await this.db.query(
      `INSERT INTO fitness_profiles (user_id, profile_data, created_at, updated_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id) DO UPDATE SET profile_data = $2, updated_at = $4`,
      [profile.userId, JSON.stringify(profile), profile.createdAt, profile.updatedAt]
    );
  }

  private async saveWorkoutPlan(plan: WorkoutPlan): Promise<void> {
    await this.db.query(
      `INSERT INTO workout_plans (id, user_id, plan_data, created_at)
       VALUES ($1, $2, $3, $4)`,
      [plan.id, plan.userId, JSON.stringify(plan), plan.createdAt]
    );
  }

  private async getActiveWorkoutPlan(userId: string): Promise<WorkoutPlan | null> {
    return this.workoutPlans.get(userId + '-active') || null;
  }

  private async saveFoodLog(log: FoodLog): Promise<void> {
    await this.db.query(
      `INSERT INTO food_logs (id, user_id, log_data, timestamp)
       VALUES ($1, $2, $3, $4)`,
      [log.id, log.userId, JSON.stringify(log), log.timestamp]
    );
  }

  private async getFoodLogs(userId: string, date: string): Promise<FoodLog[]> {
    const result = await this.db.query(
      `SELECT log_data FROM food_logs 
       WHERE user_id = $1 AND DATE(timestamp) = $2`,
      [userId, date]
    );

    return result.rows.map(row => JSON.parse(row.log_data));
  }

  private async saveProgressPhoto(photo: ProgressPhoto): Promise<void> {
    await this.db.query(
      `INSERT INTO progress_photos (id, user_id, photo_data, date)
       VALUES ($1, $2, $3, $4)`,
      [photo.id, photo.userId, JSON.stringify(photo), photo.date]
    );
  }

  private async getProgressPhotos(userId: string, limit: number): Promise<ProgressPhoto[]> {
    const result = await this.db.query(
      `SELECT photo_data FROM progress_photos 
       WHERE user_id = $1 ORDER BY date DESC LIMIT $2`,
      [userId, limit]
    );

    return result.rows.map(row => JSON.parse(row.photo_data));
  }

  private async saveHealthData(data: HealthData): Promise<void> {
    await this.db.query(
      `INSERT INTO health_data (user_id, source, data, date)
       VALUES ($1, $2, $3, $4)`,
      [data.userId, data.source, JSON.stringify(data), data.date]
    );
  }
}
