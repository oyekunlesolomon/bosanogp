const express = require('express');
const Report = require('../models/Report');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');
const multer = require('multer');
const path = require('path');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

// Create uploads directories if they don't exist
const fs = require('fs');
const uploadDirs = ['uploads', 'uploads/images', 'uploads/videos'];
uploadDirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = file.mimetype.startsWith('image/') ? 'uploads/images' : 'uploads/videos';
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB limit
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type'), false);
        }
    }
});

// Create a report with file uploads
router.post('/', authMiddleware, upload.fields([
    { name: 'images', maxCount: 10 },
    { name: 'videos', maxCount: 5 }
]), async (req, res) => {
    try {
        const reportData = {
            ...req.body,
            user: req.user.id,
            images: req.files?.images?.map(file => file.path) || [],
            videos: req.files?.videos?.map(file => file.path) || []
        };

        const report = new Report(reportData);
        await report.save();
        res.status(201).json(report);
    } catch (error) {
        res.status(500).json({ error: 'Error saving report' });
    }
});

// Get reports - users can only see their own reports
router.get('/', authMiddleware, async (req, res) => {
    try {
        const { userId, startDate, endDate } = req.query;
        const query = {};

        // Add user filter
        if (!req.user.isAdmin) {
            // Regular users can only see their own reports
            query.user = req.user.id;
        } else if (userId && userId !== 'all') {
            // Admins can filter by user
            query.user = userId;
        }

        // Add date filters
        if (startDate || endDate) {
            query.date = {};
            if (startDate) {
                query.date.$gte = new Date(startDate);
            }
            if (endDate) {
                query.date.$lte = new Date(endDate);
            }
        }

        const reports = await Report.find(query)
            .populate('user', 'name email')
            .sort({ date: -1 });
        res.json(reports);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching reports' });
    }
});

// Export reports to Excel (Admin only)
router.get('/export', [authMiddleware, adminMiddleware], async (req, res) => {
    try {
        const reports = await Report.find()
            .populate('user', 'name email')
            .sort({ date: -1 });

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Reports');

        // Add headers
        worksheet.columns = [
            { header: 'Date', key: 'date', width: 15 },
            { header: 'User Name', key: 'userName', width: 20 },
            { header: 'User Email', key: 'userEmail', width: 25 },
            { header: 'School', key: 'school', width: 25 },
            { header: 'Address', key: 'address', width: 30 },
            { header: 'Students Reached', key: 'studentsReached', width: 15 },
            { header: 'Teachers Reached', key: 'teachersReached', width: 15 },
            { header: 'Milk Used (Units)', key: 'milkUsed', width: 15 },
            { header: 'Bread Used (Units)', key: 'breadUsed', width: 15 },
            { header: 'Images Count', key: 'imagesCount', width: 12 },
            { header: 'Videos Count', key: 'videosCount', width: 12 }
        ];

        // Add data
        reports.forEach(report => {
            worksheet.addRow({
                date: new Date(report.date).toLocaleDateString(),
                userName: report.user?.name || 'Unknown',
                userEmail: report.user?.email || 'Unknown',
                school: report.school,
                address: report.address,
                studentsReached: report.studentsReached,
                teachersReached: report.teachersReached,
                milkUsed: report.milkUsed,
                breadUsed: report.breadUsed,
                imagesCount: report.images?.length || 0,
                videosCount: report.videos?.length || 0
            });
        });

        // Style the header row
        worksheet.getRow(1).font = { bold: true };
        worksheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE0E0E0' }
        };

        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
            'Content-Disposition',
            'attachment; filename=reports.xlsx'
        );

        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        res.status(500).json({ error: 'Error exporting reports' });
    }
});

// Add this route to handle report downloads
router.get('/:id/download', [authMiddleware, adminMiddleware], async (req, res) => {
    try {
        const report = await Report.findById(req.params.id)
            .populate('user', 'name email');
        
        if (!report) {
            return res.status(404).json({ message: 'Report not found' });
        }

        // Generate PDF using the report data
        const doc = new PDFDocument();

        // Set response headers
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Report-${report.school}.pdf`);

        // Pipe the PDF document to the response
        doc.pipe(res);

        // Add content to the PDF
        doc.fontSize(20).text('Report Details', { align: 'center' });
        doc.moveDown();
        doc.fontSize(12).text(`School: ${report.school}`);
        doc.text(`Address: ${report.address}`);
        doc.text(`Date: ${new Date(report.date).toLocaleDateString()}`);
        doc.text(`Reported by: ${report.user.name} (${report.user.email})`);
        doc.moveDown();
        doc.text(`Students Reached: ${report.studentsReached}`);
        doc.text(`Teachers Reached: ${report.teachersReached}`);
        doc.text(`Milk Used: ${report.milkUsed} units`);
        doc.text(`Bread Used: ${report.breadUsed} units`);

        // Finalize the PDF
        doc.end();
    } catch (error) {
        res.status(500).json({ message: 'Error generating report' });
    }
});

module.exports = router; 