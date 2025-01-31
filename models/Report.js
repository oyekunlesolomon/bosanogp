const mongoose = require('mongoose');

const ReportSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    school: String,
    address: String,
    studentsReached: Number,
    teachersReached: Number,
    milkUsed: Number,
    breadUsed: Number,
    images: [String],
    videos: [String],
    date: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Report', ReportSchema); 