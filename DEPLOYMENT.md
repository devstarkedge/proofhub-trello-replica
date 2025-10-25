# FlowTask Deployment Guide

## 🚀 Vercel Deployment

This guide will help you deploy your FlowTask application to Vercel with both frontend and backend.

## 📋 Prerequisites

1. **Vercel Account**: Sign up at [vercel.com](https://vercel.com)
2. **MongoDB Database**: Set up MongoDB Atlas or use a local MongoDB instance
3. **Git Repository**: Your code should be in a Git repository (GitHub, GitLab, or Bitbucket)

## 🔧 Environment Variables

### Required Environment Variables

Set these in your Vercel dashboard under Project Settings > Environment Variables:

```bash
# Database
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/flowtask?retryWrites=true&w=majority

# JWT Authentication
JWT_SECRET=your_super_secret_jwt_key_here_make_it_long_and_random
JWT_EXPIRE=30d

# Frontend URL (for CORS)
FRONTEND_URL=https://your-app-name.vercel.app

# Email Configuration (Optional - for notifications)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_password

# Environment
NODE_ENV=production
```

### Frontend Environment Variables

Create a `.env` file in the `frontend` directory:

```bash
# Frontend Environment Variables
VITE_BACKEND_URL=https://your-app-name.vercel.app/api
```

## 🏗️ Project Structure

```
FlowTask/
├── backend/
│   ├── api/                 # Vercel serverless functions
│   │   ├── index.js        # Main API handler
│   │   ├── auth.js         # Authentication routes
│   │   ├── boards.js       # Board management
│   │   ├── cards.js        # Card management
│   │   ├── lists.js        # List management
│   │   ├── teams.js        # Team management
│   │   ├── users.js        # User management
│   │   ├── comments.js     # Comment system
│   │   ├── notifications.js # Notifications
│   │   ├── search.js       # Search functionality
│   │   ├── analytics.js    # Analytics
│   │   ├── departments.js  # Department management
│   │   └── admin.js        # Admin panel
│   ├── controllers/        # Business logic
│   ├── middleware/         # Custom middleware
│   ├── models/            # Database models
│   ├── routes/            # Original routes (for reference)
│   ├── utils/             # Utility functions
│   └── package.json
├── frontend/
│   ├── src/               # React source code
│   ├── dist/              # Built frontend (generated)
│   └── package.json
├── vercel.json            # Vercel configuration
└── package.json           # Root package.json
```

## 🚀 Deployment Steps

### 1. Prepare Your Code

1. **Build the frontend**:
   ```bash
   cd frontend
   npm run build
   ```

2. **Commit your changes**:
   ```bash
   git add .
   git commit -m "Prepare for Vercel deployment"
   git push
   ```

### 2. Deploy to Vercel

#### Option A: Deploy via Vercel CLI

1. **Install Vercel CLI**:
   ```bash
   npm i -g vercel
   ```

2. **Login to Vercel**:
   ```bash
   vercel login
   ```

3. **Deploy**:
   ```bash
   vercel
   ```

4. **Set environment variables**:
   ```bash
   vercel env add MONGO_URI
   vercel env add JWT_SECRET
   vercel env add FRONTEND_URL
   # ... add all required variables
   ```

#### Option B: Deploy via Vercel Dashboard

1. **Connect your repository**:
   - Go to [vercel.com/dashboard](https://vercel.com/dashboard)
   - Click "New Project"
   - Import your Git repository

2. **Configure build settings**:
   - Framework Preset: Other
   - Build Command: `npm run build`
   - Output Directory: `frontend/dist`
   - Install Command: `npm run install:all`

3. **Set environment variables**:
   - Go to Project Settings > Environment Variables
   - Add all required variables listed above

4. **Deploy**:
   - Click "Deploy"

## 🔍 Testing Your Deployment

### 1. Health Check

Visit: `https://your-app-name.vercel.app/api/health`

Expected response:
```json
{
  "status": "OK",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "environment": "production"
}
```

### 2. API Endpoints

Test your API endpoints:
- `GET /api/auth/me` - User authentication
- `GET /api/boards` - Get boards
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login

### 3. Frontend

- Visit your main domain to see the React app
- Test user registration and login
- Create boards, lists, and cards
- Test all major functionality

## 🐛 Troubleshooting

### Common Issues

1. **FUNCTION_INVOCATION_FAILED**:
   - Check environment variables are set correctly
   - Verify MongoDB connection string
   - Check function logs in Vercel dashboard

2. **CORS Errors**:
   - Ensure `FRONTEND_URL` is set correctly
   - Check that the frontend URL matches your Vercel domain

3. **Database Connection Issues**:
   - Verify MongoDB Atlas whitelist includes Vercel IPs
   - Check connection string format
   - Ensure database user has proper permissions

4. **Build Failures**:
   - Check that all dependencies are installed
   - Verify build command in `package.json`
   - Check Vercel build logs

### Debugging

1. **Check Vercel Function Logs**:
   - Go to your project dashboard
   - Click on "Functions" tab
   - View logs for each function

2. **Test Locally**:
   ```bash
   # Test backend API
   cd backend
   npm run dev
   
   # Test frontend
   cd frontend
   npm run dev
   ```

## 📊 Monitoring

### Vercel Analytics

- Enable Vercel Analytics in your project settings
- Monitor function performance and errors
- Track user interactions

### Database Monitoring

- Use MongoDB Atlas monitoring
- Set up alerts for connection issues
- Monitor query performance

## 🔄 Updates and Maintenance

### Updating Your App

1. **Make changes** to your code
2. **Test locally**:
   ```bash
   npm run dev
   ```
3. **Build frontend**:
   ```bash
   npm run build
   ```
4. **Commit and push**:
   ```bash
   git add .
   git commit -m "Update app"
   git push
   ```
5. **Vercel will automatically deploy** the changes

### Environment Variable Updates

1. Go to Vercel dashboard
2. Project Settings > Environment Variables
3. Update the required variables
4. Redeploy the project

## 🎯 Performance Optimization

### Frontend Optimization

- Images are automatically optimized by Vercel
- Static assets are served from CDN
- Code splitting is handled by Vite

### Backend Optimization

- Functions are serverless and auto-scale
- Database connections are pooled
- Response caching can be added

## 🔒 Security Considerations

1. **Environment Variables**: Never commit `.env` files
2. **JWT Secrets**: Use strong, random secrets
3. **CORS**: Configure properly for your domain
4. **Database**: Use connection strings with proper authentication
5. **API Routes**: Implement proper authentication and validation

## 📞 Support

If you encounter issues:

1. Check the troubleshooting section above
2. Review Vercel documentation
3. Check MongoDB Atlas documentation
4. Review your application logs

## 🎉 Success!

Once deployed, your FlowTask application will be available at:
`https://your-app-name.vercel.app`

The application includes:
- ✅ User authentication and authorization
- ✅ Board, list, and card management
- ✅ Team collaboration features
- ✅ Real-time notifications (via polling)
- ✅ Search functionality
- ✅ Analytics and reporting
- ✅ Admin panel
- ✅ Responsive design

Happy coding! 🚀
