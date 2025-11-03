const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const { ReportAnalytics } = require('./report-analytics');

// Generate professional PDF report with charts and analytics
router.post('/api/generate-report', async (req, res) => {
    const { comparisonId, config } = req.body;
    
    if (!comparisonId) {
        return res.status(400).json({ error: 'Comparison ID is required' });
    }
    
    try {
        // Get comparison data
        const comparisonDir = path.join(__dirname, '..', 'storage', 'data-extract', comparisonId);
        const summaryPath = path.join(comparisonDir, 'comparison_results', 'comparison_summary.json');
        const csvPath = path.join(comparisonDir, 'comparison_results', 'all_differences.csv');
        
        if (!fs.existsSync(summaryPath) || !fs.existsSync(csvPath)) {
            return res.status(404).json({ error: 'Comparison results not found' });
        }
        
        const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
        const csvContent = fs.readFileSync(csvPath, 'utf8');
        
        // Generate analytics
        const analytics = new ReportAnalytics(summary, csvContent);
        analytics.analytics.recommendations = analytics.generateRecommendations(analytics.analytics);
        const charts = await analytics.generateCharts();
        
        // Create PDF document
        const doc = new PDFDocument({ 
            size: 'A4',
            margin: 50,
            info: {
                Title: `Salesforce Comparison Report - ${comparisonId}`,
                Author: 'Salesforce Comparison Tool',
                Subject: 'Organization Comparison Analysis',
                Keywords: 'salesforce, comparison, analysis, report'
            }
        });
        
        // Set response headers
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="comparison-report-${comparisonId}.pdf"`);
        
        // Pipe the PDF directly to response
        doc.pipe(res);
        
        // Ensure config has sections array
        if (!config.sections) {
            config.sections = ['summary', 'graphs', 'details', 'recommendations'];
        }
        
        // Generate professional PDF content
        try {
            await generateProfessionalPDF(doc, comparisonId, summary, analytics, charts, config);
            
            // Finalize the PDF
            doc.end();
        } catch (pdfError) {
            console.error('Error in PDF generation:', pdfError);
            // Destroy the stream if there's an error
            doc.destroy();
            throw pdfError;
        }
        
    } catch (error) {
        console.error('Error generating report:', error);
        // Make sure we haven't already sent headers
        if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to generate report' });
        }
    }
});

// Get recent reports for a comparison
router.get('/api/recent-reports', async (req, res) => {
    const { comparisonId } = req.query;
    
    // For now, return empty array since we don't store generated reports yet
    // In a future enhancement, we could store generated reports in a database
    const recentReports = [];
    
    res.json(recentReports);
});

// Download a previously generated report
router.get('/api/download-report/:reportId', async (req, res) => {
    const { reportId } = req.params;
    
    // For now, return 404 since we don't store generated reports
    // In a future enhancement, we would retrieve the report from storage
    res.status(404).json({ error: 'Report storage not yet implemented. Please generate a new report.' });
});

async function generateProfessionalPDF(doc, comparisonId, summary, analytics, charts, config) {
    const pageWidth = doc.page.width - 100; // Account for margins
    const orgs = summary.organizations || ['Org 1', 'Org 2'];
    
    // Title Page
    doc.fillColor('#1589EE')
       .fontSize(32)
       .font('Helvetica-Bold')
       .text('Data Comparison Report', 50, 100, { align: 'center' });
    
    doc.fillColor('#444')
       .fontSize(18)
       .font('Helvetica')
       .text(`${orgs[0]} vs ${orgs[1]}`, 50, 150, { align: 'center' });
    
    doc.fontSize(12)
       .fillColor('#666')
       .text(`Analysis Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, 50, 200, { align: 'center' });
    
    // Data Comparison Summary
    doc.strokeColor('#1589EE')
       .lineWidth(2)
       .rect(50, 250, pageWidth, 200)
       .stroke();
    
    doc.fontSize(16)
       .font('Helvetica-Bold')
       .fillColor('#1589EE')
       .text('DATA COMPARISON SUMMARY', 70, 270);
    
    const matchRate = parseFloat(analytics.analytics.dataQuality.matchRate);
    
    doc.fontSize(12)
       .font('Helvetica')
       .fillColor('#444')
       .text(`Match Rate: ${matchRate}%`, 70, 310)
       .text(`Total Differences: ${analytics.analytics.overview.totalDifferences.toLocaleString()}`, 70, 330)
       .text(`Objects Analyzed: ${analytics.analytics.overview.totalObjects}`, 70, 350)
       .text(`Value Differences: ${analytics.analytics.byType.VALUE_DIFFERENCE || 0}`, 70, 370)
       .text(`Missing Records: ${analytics.analytics.byType.RECORD_MISSING || 0}`, 70, 390);
    
    // Top Objects with Differences
    doc.fontSize(11)
       .font('Helvetica-Bold')
       .text('Top Objects:', 70, 420)
       .font('Helvetica');
       
    let yPos = 440;
    analytics.analytics.topMismatches.slice(0, 3).forEach(obj => {
        doc.text(`• ${obj.object}: ${obj.totalDifferences} differences (${obj.percentageOfTotal}%)`, 90, yPos);
        yPos += 20;
    });
    
    // Visual Status Indicator
    const statusColor = matchRate >= 95 ? '#04844b' : matchRate >= 85 ? '#FF9500' : '#FF3B30';
    doc.circle(450, 350, 40)
       .fill(statusColor);
    doc.fillColor('#fff')
       .font('Helvetica-Bold')
       .fontSize(24)
       .text(`${matchRate}%`, 410, 340, { width: 80, align: 'center' });
    
    // New page - Critical Issues Section
    doc.addPage();
    
    doc.fontSize(20)
       .font('Helvetica-Bold')
       .fillColor('#1589EE')
       .text('OBJECT ANALYSIS', 50, 50);
    
    // Most Affected Objects
    doc.fontSize(14)
       .font('Helvetica-Bold')
       .fillColor('#444')
       .text('Objects with Most Differences', 50, 90);
    
    yPos = 120;
    const criticalObjects = analytics.analytics.topMismatches.slice(0, 5);
    
    criticalObjects.forEach((obj, index) => {
        const criticality = obj.percentageOfTotal > 20 ? 'Critical' : obj.percentageOfTotal > 10 ? 'High' : 'Medium';
        const critColor = criticality === 'Critical' ? '#FF3B30' : criticality === 'High' ? '#FF9500' : '#1589EE';
        
        // Object card
        doc.rect(50, yPos, pageWidth, 80)
           .fillAndStroke('#f7f9fb', '#e5e5e5');
        
        doc.fillColor(critColor)
           .fontSize(10)
           .font('Helvetica-Bold')
           .text(criticality.toUpperCase(), 60, yPos + 10);
        
        doc.fillColor('#000')
           .fontSize(14)
           .text(obj.object, 120, yPos + 10);
        
        doc.fontSize(11)
           .font('Helvetica')
           .fillColor('#444')
           .text(`${obj.totalDifferences} total discrepancies (${obj.percentageOfTotal}% of all issues)`, 60, yPos + 35)
           .text(`• Value mismatches: ${obj.valueDifferences}`, 80, yPos + 50)
           .text(`• Missing records: ${obj.recordsMissing}`, 250, yPos + 50);
        
        yPos += 90;
    });
    
    // Visual Analytics Page with Context
    doc.addPage();
    
    doc.fontSize(20)
       .font('Helvetica-Bold')
       .fillColor('#1589EE')
       .text('DATA ANALYTICS', 50, 50);
    
    // Data Quality Section
    doc.fontSize(14)
       .font('Helvetica-Bold')
       .fillColor('#444')
       .text('Data Quality Metrics', 50, 90);
    
    if (charts.dataQuality && charts.dataQuality.length > 0) {
        doc.image(charts.dataQuality, 50, 120, { width: 200 });
    } else {
        doc.fontSize(10)
           .font('Helvetica-Oblique')
           .fillColor('#666')
           .text('[Chart not available - Canvas module required]', 50, 170, { width: 200, align: 'center' });
    }
    
    // Data statistics next to gauge
    doc.fontSize(11)
       .font('Helvetica')
       .fillColor('#444')
       .text('Comparison Statistics:', 280, 140)
       .text(`• Total Records Analyzed: ${analytics.analytics.overview.totalObjects * 100} (est.)`, 290, 160)
       .text(`• Matching Records: ${matchRate}%`, 290, 180)
       .text(`• Difference Types: ${Object.keys(analytics.analytics.byType).length}`, 290, 200);
    
    // Issue Distribution with Business Context
    if (charts.typeDistribution && charts.typeDistribution.length > 0) {
        doc.fontSize(14)
           .font('Helvetica-Bold')
           .text('Types of Configuration Differences', 50, 250);
        
        doc.image(charts.typeDistribution, 50, 280, { width: 200 });
        
        // Difference breakdown
        doc.fontSize(11)
           .font('Helvetica')
           .text('Breakdown by Type:', 280, 300);
           
        let typeY = 320;
        Object.entries(analytics.analytics.byType).forEach(([type, count]) => {
            doc.text(`• ${type}: ${count} (${((count / analytics.analytics.overview.totalDifferences) * 100).toFixed(1)}%)`, 290, typeY);
            typeY += 20;
        });
    }
    
    // Actionable Insights Page
    doc.addPage();
    
    doc.fontSize(20)
       .font('Helvetica-Bold')
       .fillColor('#1589EE')
       .text('DIFFERENCE DETAILS', 50, 50);
        
    yPos = 90;
    
    // Group insights by severity
    const criticalInsights = analytics.analytics.insights.filter(i => i.severity === 'high');
    const warningInsights = analytics.analytics.insights.filter(i => i.severity === 'medium');
    
    if (criticalInsights.length > 0) {
        doc.rect(50, yPos, pageWidth, 30)
           .fill('#FF3B30');
        doc.fillColor('#fff')
           .fontSize(12)
           .font('Helvetica-Bold')
           .text('CRITICAL ISSUES REQUIRING IMMEDIATE ACTION', 60, yPos + 10);
        
        yPos += 40;
        
        criticalInsights.forEach(insight => {
            doc.fillColor('#000')
               .fontSize(11)
               .font('Helvetica-Bold')
               .text(`• ${insight.title}`, 60, yPos);
            
            doc.font('Helvetica')
               .fillColor('#444')
               .text(insight.message, 70, yPos + 15, { width: pageWidth - 20 });
            
            yPos += 50;
        });
    }
    
    if (warningInsights.length > 0) {
        yPos += 20;
        doc.rect(50, yPos, pageWidth, 30)
           .fill('#FF9500');
        doc.fillColor('#fff')
           .fontSize(12)
           .font('Helvetica-Bold')
           .text('WARNINGS - REVIEW BEFORE DEPLOYMENT', 60, yPos + 10);
        
        yPos += 40;
        
        warningInsights.forEach(insight => {
            doc.fillColor('#000')
               .fontSize(11)
               .font('Helvetica-Bold')
               .text(`• ${insight.title}`, 60, yPos);
            
            doc.font('Helvetica')
               .fillColor('#444')
               .text(insight.message, 70, yPos + 15, { width: pageWidth - 20 });
            
            yPos += 50;
        });
    }
        
    // Next Steps & Recommendations
    doc.addPage();
    
    doc.fontSize(20)
       .font('Helvetica-Bold')
       .fillColor('#1589EE')
       .text('MISSING RECORDS ANALYSIS', 50, 50);
        
    // Missing records breakdown
    doc.fontSize(14)
       .font('Helvetica-Bold')
       .fillColor('#444')
       .text('Records Missing by Object', 50, 90);
    
    yPos = 120;
    
    // Missing records by object
    const objectsWithMissing = Object.entries(analytics.analytics.byObject)
        .filter(([_, data]) => data.recordsMissing > 0)
        .sort((a, b) => b[1].recordsMissing - a[1].recordsMissing)
        .slice(0, 10);
    
    if (objectsWithMissing.length > 0) {
        objectsWithMissing.forEach(([objName, data]) => {
            // Object card
            doc.rect(50, yPos, pageWidth, 60)
               .fillAndStroke('#f7f9fb', '#e5e5e5');
            
            doc.fillColor('#000')
               .fontSize(12)
               .font('Helvetica-Bold')
               .text(objName, 60, yPos + 10);
            
            doc.fontSize(10)
               .font('Helvetica')
               .fillColor('#444')
               .text(`Missing Records: ${data.recordsMissing}`, 60, yPos + 30);
            
            // Show which org is missing
            if (data.missingInOrg) {
                const missingDetails = Object.entries(data.missingInOrg)
                    .map(([org, count]) => `${org}: ${count}`)
                    .join(' | ');
                doc.text(`Distribution: ${missingDetails}`, 60, yPos + 45);
            }
            
            yPos += 70;
            
            if (yPos > 650 && objectsWithMissing.indexOf([objName, data]) < objectsWithMissing.length - 1) {
                doc.addPage();
                yPos = 50;
            }
        });
    }
    
    // Configuration Details Summary
    doc.addPage();
    
    doc.fontSize(20)
       .font('Helvetica-Bold')
       .fillColor('#1589EE')
       .text('DETAILED OBJECT BREAKDOWN', 50, 50);
    
    doc.fontSize(12)
       .font('Helvetica')
       .fillColor('#666')
       .text('Detailed breakdown of configuration differences for each business object', 50, 80);
        
    const sortedObjects = Object.entries(analytics.analytics.byObject)
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, 10);
    
    yPos = 110;
    
    // Create object cards instead of table
    sortedObjects.forEach(([objName, data], index) => {
        const percentage = ((data.total / analytics.analytics.overview.totalDifferences) * 100).toFixed(1);
        const impact = percentage > 20 ? 'High Impact' : percentage > 10 ? 'Medium Impact' : 'Low Impact';
        const impactColor = percentage > 20 ? '#FF3B30' : percentage > 10 ? '#FF9500' : '#1589EE';
        
        // Object card
        doc.rect(50, yPos, pageWidth, 50)
           .fillAndStroke('#f7f9fb', '#e5e5e5');
        
        // Object name and impact
        doc.fillColor('#000')
           .fontSize(12)
           .font('Helvetica-Bold')
           .text(objName, 60, yPos + 10);
        
        doc.fillColor(impactColor)
           .fontSize(10)
           .text(impact, 400, yPos + 10);
        
        // Details
        doc.fillColor('#444')
           .fontSize(10)
           .font('Helvetica')
           .text(`${data.total} differences (${percentage}% of total)`, 60, yPos + 28)
           .text(`Value: ${data.byType.VALUE_DIFFERENCE || 0}`, 220, yPos + 28)
           .text(`Missing: ${data.byType.RECORD_MISSING || 0}`, 320, yPos + 28)
           .text(`Fields: ${data.uniqueFields}`, 420, yPos + 28);
        
        yPos += 60;
        
        if (yPos > 650 && index < sortedObjects.length - 1) {
            doc.addPage();
            yPos = 50;
        }
    });
        
    // Environment Comparison Summary
    doc.addPage();
    
    doc.fontSize(20)
       .font('Helvetica-Bold')
       .fillColor('#1589EE')
       .text('ENVIRONMENT COMPARISON SUMMARY', 50, 50);
    
    yPos = 90;
    
    // Side-by-side org comparison
    const colWidth = pageWidth / 2 - 10;
    
    orgs.forEach((org, index) => {
        const orgData = analytics.analytics.byOrg[org];
        if (orgData) {
            const xPos = index === 0 ? 50 : 50 + colWidth + 20;
            
            // Org header
            doc.rect(xPos, yPos, colWidth, 40)
               .fill('#1589EE');
            
            doc.fillColor('#fff')
               .fontSize(14)
               .font('Helvetica-Bold')
               .text(org, xPos + 10, yPos + 15);
            
            // Org details card
            doc.rect(xPos, yPos + 40, colWidth, 160)
               .fillAndStroke('#fff', '#e5e5e5');
            
            const completeness = parseFloat(analytics.analytics.dataQuality.completenessScore[org]);
            const compColor = completeness >= 95 ? '#04844b' : completeness >= 90 ? '#FF9500' : '#FF3B30';
            
            doc.fillColor('#000')
               .fontSize(11)
               .font('Helvetica-Bold')
               .text('Environment Health:', xPos + 10, yPos + 55);
            
            // Completeness indicator
            doc.rect(xPos + 10, yPos + 75, colWidth - 20, 20)
               .stroke('#e5e5e5');
            doc.rect(xPos + 10, yPos + 75, (colWidth - 20) * (completeness / 100), 20)
               .fill(compColor);
            doc.fillColor('#000')
               .fontSize(10)
               .text(`${completeness}% Complete`, xPos + colWidth/2 - 30, yPos + 80);
            
            // Stats
            doc.fontSize(10)
               .font('Helvetica')
               .fillColor('#444')
               .text(`Missing Records: ${orgData.missingRecords.toLocaleString()}`, xPos + 10, yPos + 110)
               .text(`Value Differences: ${orgData.valueDifferences.toLocaleString()}`, xPos + 10, yPos + 130)
               .text(`Affected Objects: ${orgData.affectedObjectsCount}`, xPos + 10, yPos + 150)
               .text(`Total Issues: ${orgData.totalIssues.toLocaleString()}`, xPos + 10, yPos + 170);
        }
    });
    // Summary Statistics Page
    doc.addPage();
    
    doc.fontSize(20)
       .font('Helvetica-Bold')
       .fillColor('#1589EE')
       .text('DETAILED STATISTICS', 50, 100, { align: 'center' });
    
    // Statistics box
    doc.rect(50, 150, pageWidth, 200)
       .fillAndStroke('#f7f9fb', '#1589EE');
    
    doc.fillColor('#000')
       .fontSize(12)
       .font('Helvetica')
       .text('Overall Comparison Results:', 70, 170);
    
    doc.fontSize(11)
       .text(`Match Rate: ${matchRate}%`, 80, 200)
       .text(`Total Differences Found: ${analytics.analytics.overview.totalDifferences.toLocaleString()}`, 80, 220)
       .text(`Objects with Differences: ${Object.keys(analytics.analytics.byObject).length}`, 80, 240)
       .text(`Total Objects Analyzed: ${analytics.analytics.overview.totalObjects}`, 80, 260)
       .text(`Value Differences: ${analytics.analytics.byType.VALUE_DIFFERENCE || 0}`, 80, 280)
       .text(`Missing Records: ${analytics.analytics.byType.RECORD_MISSING || 0}`, 80, 300)
       .text(`Field Differences: ${analytics.analytics.byType.FIELD_MISSING || 0}`, 80, 320);
    
    // Add footer to all pages
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        doc.fontSize(8)
           .font('Helvetica')
           .fillColor('#999')
           .text(`${orgs[0]} vs ${orgs[1]} | Configuration Comparison Report | Page ${i + 1} of ${range.count}`, 
                50, doc.page.height - 30, { align: 'center' });
    }
}

module.exports = router;