const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const AdminCode = require('../models/AdminCode');
const crypto = require('crypto');

// Register route
router.post('/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        
        // Check if user already exists
        let user = await User.findOne({ email });
        if (user) {
            return res.status(400).json({ message: 'User already exists' });
        }

        // Create new user
        user = new User({
            name,
            email,
            password: await bcrypt.hash(password, 10)
        });

        await user.save();

        // Create token
        const token = jwt.sign(
            { id: user._id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.status(201).json({ token });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Login route
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // Check if user exists
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        // Verify password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        // Create token with isAdmin flag
        const token = jwt.sign(
            { 
                id: user._id, 
                email: user.email,
                isAdmin: user.isAdmin 
            },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({ token, isAdmin: user.isAdmin });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Route to generate initial admin code
router.post('/init-admin', async (req, res) => {
    try {
        const { secretKey } = req.body;
        
        // Verify the secret key from .env
        if (secretKey !== process.env.ADMIN_REGISTRATION_CODE) {
            return res.status(403).json({ message: 'Invalid secret key' });
        }

        // Generate a new admin code
        const code = crypto.randomBytes(4).toString('hex').toUpperCase();
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        const adminCode = new AdminCode({
            code,
            expiresAt
        });

        await adminCode.save();

        res.json({ 
            code,
            expiresAt,
            message: 'Initial admin code generated successfully'
        });
    } catch (error) {
        console.error('Error generating initial admin code:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Admin registration route
router.post('/admin/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;

        // Check if user exists
        let user = await User.findOne({ email });
        if (user) {
            return res.status(400).json({ message: 'User already exists' });
        }

        // Check if this is the first admin
        const adminCount = await User.countDocuments({ isAdmin: true });
        const isFirstAdmin = adminCount === 0;

        // Create new admin user
        user = new User({
            name,
            email,
            password: await bcrypt.hash(password, 10),
            isAdmin: isFirstAdmin // Only first registration gets admin rights
        });

        await user.save();

        // Create token
        const token = jwt.sign(
            { id: user._id, email: user.email, isAdmin: isFirstAdmin },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.status(201).json({ 
            token,
            isAdmin: isFirstAdmin,
            message: isFirstAdmin ? 'Admin account created successfully' : 'User account created successfully'
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router; 