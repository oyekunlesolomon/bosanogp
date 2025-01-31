const express = require('express');
const router = express.Router();
const Report = require('../models/Report');
const User = require('../models/User');
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');
const crypto = require('crypto');
const AdminCode = require('../models/AdminCode');

// Get all reports with user details
router.get('/reports', [authMiddleware, adminMiddleware], async (req, res) => {
    try {
        const reports = await Report.find()
            .populate('user', 'name email')
            .sort({ date: -1 });
        res.json(reports);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching reports' });
    }
});

// Get all users with report counts
router.get('/users', [authMiddleware, adminMiddleware], async (req, res) => {
    try {
        const users = await User.aggregate([
            {
                $lookup: {
                    from: 'reports',
                    localField: '_id',
                    foreignField: 'user',
                    as: 'reports'
                }
            },
            {
                $project: {
                    name: 1,
                    email: 1,
                    reportCount: { $size: '$reports' },
                    lastActive: { $max: '$reports.date' }
                }
            }
        ]);
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching users' });
    }
});

// Generate new admin registration code (only super admins can do this)
router.post('/generate-code', [authMiddleware, adminMiddleware], async (req, res) => {
    try {
        // Generate a random 8-character code
        const code = crypto.randomBytes(4).toString('hex').toUpperCase();
        
        // Code expires in 24 hours
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

        const adminCode = new AdminCode({
            code,
            createdBy: req.user.id,
            expiresAt
        });

        await adminCode.save();

        res.json({ 
            code,
            expiresAt,
            message: 'Admin registration code generated successfully'
        });
    } catch (error) {
        res.status(500).json({ message: 'Error generating admin code' });
    }
});

// View all active admin codes
router.get('/codes', [authMiddleware, adminMiddleware], async (req, res) => {
    try {
        const codes = await AdminCode.find({
            used: false,
            expiresAt: { $gt: new Date() }
        }).populate('createdBy', 'name email');
        
        res.json(codes);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching admin codes' });
    }
});

module.exports = router; 