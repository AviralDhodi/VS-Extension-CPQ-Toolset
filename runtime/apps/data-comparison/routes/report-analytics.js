const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// Platform-specific module loading
let createCanvas, registerFont;
try {
    const canvasModule = require('canvas');
    createCanvas = canvasModule.createCanvas;
    registerFont = canvasModule.registerFont;
} catch (error) {
    console.warn('Canvas module not available for this platform. Chart generation will be skipped.');
    createCanvas = null;
    registerFont = null;
}

class ReportAnalytics {
    constructor(comparisonData, csvData) {
        this.summary = comparisonData;
        this.differences = this.parseCSV(csvData);
        this.analytics = this.generateAnalytics();
    }

    parseCSV(csvContent) {
        const lines = csvContent.trim().split('\n');
        const headers = lines[0].split(',').map(h => h.trim());
        const data = [];

        for (let i = 1; i < lines.length; i++) {
            if (lines[i].trim()) {
                const values = this.parseCSVLine(lines[i]);
                const row = {};
                headers.forEach((header, index) => {
                    row[header] = values[index] || '';
                });
                data.push(row);
            }
        }
        return data;
    }

    parseCSVLine(line) {
        const values = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"' && (i === 0 || line[i-1] !== '\\')) {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                values.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        values.push(current.trim());
        return values;
    }

    generateAnalytics() {
        const analytics = {
            overview: {
                totalDifferences: this.differences.length,
                totalObjects: this.summary.objects_processed.length,
                organizations: this.summary.organizations,
                comparisonDate: new Date(this.summary.timestamp).toLocaleDateString()
            },
            byObject: {},
            byType: {
                'VALUE_DIFFERENCE': 0,
                'RECORD_MISSING': 0,
                'FIELD_MISSING': 0
            },
            byOrg: {},
            dataQuality: {
                matchRate: 0,
                mismatchRate: 0,
                completenessScore: {}
            },
            topMismatches: [],
            orgComparison: {},
            insights: []
        };

        // Initialize org-specific analytics
        this.summary.organizations.forEach(org => {
            analytics.byOrg[org] = {
                missingRecords: 0,
                valueDifferences: 0,
                totalIssues: 0,
                affectedObjects: new Set()
            };
            analytics.dataQuality.completenessScore[org] = 100; // Start at 100%
        });

        // Get org column names
        const orgColumns = this.differences.length > 0 ? 
            Object.keys(this.differences[0]).filter(k => k.startsWith('Org_')) : 
            ['Org_1', 'Org_2'];

        // Analyze differences
        this.differences.forEach(diff => {
            const objectName = (diff.ObjectFieldName || '').split('.')[0] || 'Unknown';
            const fieldName = (diff.ObjectFieldName || '').split('.')[1] || 'Unknown';
            const diffType = diff.DifferenceType || 'Unknown';

            // Skip invalid rows
            if (!objectName || objectName === 'Unknown' || !diff.ForeignKeyValue || diff.ForeignKeyValue === 'N/A') {
                return;
            }

            // Count by object
            if (!analytics.byObject[objectName]) {
                analytics.byObject[objectName] = {
                    total: 0,
                    byType: {},
                    fields: new Set(),
                    missingInOrg: {},
                    valueDifferences: 0,
                    recordsMissing: 0
                };
            }
            analytics.byObject[objectName].total++;
            analytics.byObject[objectName].byType[diffType] = (analytics.byObject[objectName].byType[diffType] || 0) + 1;
            analytics.byObject[objectName].fields.add(fieldName);

            // Count by type
            if (analytics.byType[diffType] !== undefined) {
                analytics.byType[diffType]++;
            }

            // Analyze org-specific data
            orgColumns.forEach((orgCol, index) => {
                const orgName = this.summary.organizations[index] || orgCol;
                const orgValue = diff[orgCol];
                
                if (diffType === 'RECORD_MISSING') {
                    if (orgValue === 'MISSING' || !orgValue || orgValue === '') {
                        analytics.byOrg[orgName].missingRecords++;
                        analytics.byOrg[orgName].affectedObjects.add(objectName);
                        
                        // Track which org is missing the record
                        if (!analytics.byObject[objectName].missingInOrg[orgName]) {
                            analytics.byObject[objectName].missingInOrg[orgName] = 0;
                        }
                        analytics.byObject[objectName].missingInOrg[orgName]++;
                        analytics.byObject[objectName].recordsMissing++;
                    }
                } else if (diffType === 'VALUE_DIFFERENCE') {
                    analytics.byOrg[orgName].valueDifferences++;
                    analytics.byOrg[orgName].affectedObjects.add(objectName);
                    analytics.byObject[objectName].valueDifferences++;
                }
                
                analytics.byOrg[orgName].totalIssues = 
                    analytics.byOrg[orgName].missingRecords + 
                    analytics.byOrg[orgName].valueDifferences;
            });
        });

        // Calculate data quality metrics
        const totalPossibleRecords = this.summary.objects_processed.length * 1000; // Estimate
        const totalMissingRecords = analytics.byType.RECORD_MISSING || 0;
        const totalValueDifferences = analytics.byType.VALUE_DIFFERENCE || 0;
        
        analytics.dataQuality.matchRate = Math.max(0, 
            ((totalPossibleRecords - analytics.overview.totalDifferences) / totalPossibleRecords * 100)
        ).toFixed(2);
        
        analytics.dataQuality.mismatchRate = (100 - analytics.dataQuality.matchRate).toFixed(2);

        // Calculate completeness score per org
        Object.keys(analytics.byOrg).forEach(org => {
            const missingCount = analytics.byOrg[org].missingRecords;
            analytics.dataQuality.completenessScore[org] = Math.max(0,
                (100 - (missingCount / totalPossibleRecords * 100))
            ).toFixed(2);
        });

        // Get top mismatched objects
        analytics.topMismatches = Object.entries(analytics.byObject)
            .sort((a, b) => b[1].total - a[1].total)
            .slice(0, 10)
            .map(([name, data]) => ({
                object: name,
                totalDifferences: data.total,
                valueDifferences: data.valueDifferences || 0,
                recordsMissing: data.recordsMissing || 0,
                percentageOfTotal: ((data.total / analytics.overview.totalDifferences) * 100).toFixed(1),
                uniqueFieldsAffected: data.fields.size
            }));

        // Generate org comparison
        const orgs = this.summary.organizations;
        if (orgs.length >= 2) {
            analytics.orgComparison = {
                [orgs[0]]: {
                    recordsNotIn: orgs[1],
                    count: analytics.byOrg[orgs[0]].missingRecords,
                    percentage: ((analytics.byOrg[orgs[0]].missingRecords / analytics.overview.totalDifferences) * 100).toFixed(1)
                },
                [orgs[1]]: {
                    recordsNotIn: orgs[0],
                    count: analytics.byOrg[orgs[1]].missingRecords,
                    percentage: ((analytics.byOrg[orgs[1]].missingRecords / analytics.overview.totalDifferences) * 100).toFixed(1)
                }
            };
        }

        // Generate insights
        analytics.insights = this.generateDataInsights(analytics);
        
        // Generate recommendations
        analytics.recommendations = this.generateRecommendations(analytics);

        // Convert sets to counts
        Object.keys(analytics.byObject).forEach(obj => {
            analytics.byObject[obj].uniqueFields = analytics.byObject[obj].fields.size;
            delete analytics.byObject[obj].fields;
        });

        Object.keys(analytics.byOrg).forEach(org => {
            analytics.byOrg[org].affectedObjectsCount = analytics.byOrg[org].affectedObjects.size;
            delete analytics.byOrg[org].affectedObjects;
        });

        return analytics;
    }

    generateDataInsights(analytics) {
        const insights = [];
        
        // Overall data comparison results
        const matchRate = parseFloat(analytics.dataQuality.matchRate);
        insights.push({
            type: 'overview',
            title: 'Data Comparison Summary',
            message: `Match Rate: ${matchRate}%\nTotal Differences: ${analytics.overview.totalDifferences.toLocaleString()}\nObjects Analyzed: ${analytics.overview.totalObjects}\nValue Differences: ${analytics.byType.VALUE_DIFFERENCE || 0}\nMissing Records: ${analytics.byType.RECORD_MISSING || 0}`,
            severity: matchRate < 85 ? 'high' : matchRate < 95 ? 'medium' : 'low'
        });
        
        // Org-specific insights
        const orgs = this.summary.organizations;
        if (orgs.length >= 2) {
            const org1 = orgs[0];
            const org2 = orgs[1];
            
            const org1Missing = analytics.byOrg[org1].missingRecords;
            const org2Missing = analytics.byOrg[org2].missingRecords;
            
            if (org1Missing > 0 || org2Missing > 0) {
                insights.push({
                    type: 'org_comparison',
                    title: 'Missing Records Analysis',
                    message: `${org1}: ${org1Missing} missing records\n${org2}: ${org2Missing} missing records\nTotal Missing: ${org1Missing + org2Missing}`,
                    severity: Math.max(org1Missing, org2Missing) > 100 ? 'high' : Math.max(org1Missing, org2Missing) > 20 ? 'medium' : 'low'
                });
            }
        }
        
        // Critical object insights
        const criticalObjects = analytics.topMismatches.filter(obj => obj.percentageOfTotal > 15);
        if (criticalObjects.length > 0) {
            const objectDetails = criticalObjects.map(o => 
                `${o.object}: ${o.totalDifferences} differences (${o.percentageOfTotal}%)`
            ).join('\n');
            
            insights.push({
                type: 'object_analysis',
                title: 'Top Objects with Differences',
                message: objectDetails,
                severity: 'high'
            });
        }
        
        // Pattern detection with business impact
        const valueDiffPercentage = ((analytics.byType.VALUE_DIFFERENCE / analytics.overview.totalDifferences) * 100).toFixed(1);
        const missingPercentage = ((analytics.byType.RECORD_MISSING / analytics.overview.totalDifferences) * 100).toFixed(1);
        
        if (valueDiffPercentage > 60) {
            insights.push({
                type: 'pattern',
                title: 'Difference Type Distribution',
                message: `Value Differences: ${valueDiffPercentage}% (${analytics.byType.VALUE_DIFFERENCE})\nMissing Records: ${missingPercentage}% (${analytics.byType.RECORD_MISSING})`,
                severity: 'medium'
            });
        }
        
        if (missingPercentage > 40) {
            insights.push({
                type: 'pattern',
                title: 'Incomplete Configuration Migration',
                message: `${missingPercentage}% of issues are missing configuration records. This suggests incomplete deployments or environment-specific configurations. These missing records could cause functionality gaps or deployment failures.`,
                severity: 'high'
            });
        }
        
        // Environment health insights
        Object.entries(analytics.dataQuality.completenessScore).forEach(([org, score]) => {
            if (score < 95) {
                const scoreNum = parseFloat(score);
                insights.push({
                    type: 'completeness',
                    title: `${org} Environment Health Warning`,
                    message: `${org} has a configuration completeness score of ${score}%. ${scoreNum < 90 ? 
                        'This environment has significant configuration gaps that must be addressed before deployment.' :
                        'Some configuration records are missing. Review and sync before deploying critical changes.'}`,
                    severity: scoreNum < 90 ? 'high' : 'medium'
                });
            }
        });
        
        return insights;
    }
    
    generateRecommendations(analytics) {
        const recommendations = [];
        const matchRate = parseFloat(analytics.dataQuality.matchRate);
        
        // Critical sync recommendations
        if (analytics.byType.RECORD_MISSING > 50) {
            recommendations.push({
                priority: 'Critical',
                title: 'Sync Missing Configuration Records',
                description: `${analytics.byType.RECORD_MISSING.toLocaleString()} configuration records exist in one environment but not the other. This will cause deployment failures.`,
                actions: [
                    'Run configuration comparison report to identify missing records',
                    'Use data loader or change sets to migrate missing configurations',
                    'Validate all dependent configurations are included',
                    'Test in a sandbox environment before production deployment'
                ]
            });
        }
        
        if (matchRate < 90) {
            recommendations.push({
                priority: 'High',
                title: 'Establish Configuration Management Process',
                description: `Your environments are only ${matchRate}% synchronized. Without proper configuration management, deployments will fail and environments will continue to drift.`,
                actions: [
                    'Document all configuration changes in both environments',
                    'Implement change control process for production configs',
                    'Use version control for configuration metadata',
                    'Schedule weekly configuration sync reviews'
                ]
            });
        }
        
        // Business object specific recommendations
        const criticalObjects = analytics.topMismatches.filter(obj => obj.percentageOfTotal > 15);
        if (criticalObjects.length > 0) {
            const topObject = criticalObjects[0];
            recommendations.push({
                priority: 'High',
                title: `Prioritize ${topObject.object} Configuration Sync`,
                description: `${topObject.object} represents ${topObject.percentageOfTotal}% of all configuration issues. Fixing this object will have the highest impact on environment alignment.`,
                actions: [
                    `Export all ${topObject.object} records from production`,
                    `Compare with UAT using this tool's detailed view`,
                    `Create change set or data package for sync`,
                    `Document any environment-specific configurations that should remain different`
                ]
            });
        }
        
        // Environment-specific recommendations
        const orgs = Object.keys(analytics.byOrg);
        orgs.forEach(org => {
            const completeness = parseFloat(analytics.dataQuality.completenessScore[org]);
            if (completeness < 95) {
                recommendations.push({
                    priority: completeness < 90 ? 'Critical' : 'High',
                    title: `${org} Requires Configuration Audit`,
                    description: `${org} is missing ${analytics.byOrg[org].missingRecords} configuration records. This environment is not deployment-ready.`,
                    actions: [
                        'Run full configuration audit for this environment',
                        'Identify source of configuration gaps',
                        'Create deployment package with missing configs',
                        'Validate after sync using this comparison tool'
                    ]
                });
            }
        });
        
        // Best practice recommendations
        if (recommendations.length === 0) {
            recommendations.push({
                priority: 'Medium',
                title: 'Maintain Configuration Excellence',
                description: 'Your environments are well-synchronized. Continue following best practices.',
                actions: [
                    'Run weekly configuration comparisons',
                    'Document any intentional environment differences',
                    'Use this baseline for future deployment validations',
                    'Consider automating configuration sync processes'
                ]
            });
        }
        
        return recommendations;
    }

    async generateCharts() {
        // Check if canvas is available
        if (!createCanvas) {
            console.warn('Canvas module not available. Returning empty charts.');
            return {
                typeDistribution: Buffer.from(''),
                objectDistribution: Buffer.from(''),
                orgComparison: Buffer.from(''),
                dataQuality: Buffer.from('')
            };
        }

        const charts = {};

        // 1. Difference Type Distribution (Pie Chart)
        const typeCanvas = createCanvas(400, 400);
        const typeCtx = typeCanvas.getContext('2d');
        
        const typeData = {
            labels: ['Value Differences', 'Missing Records', 'Missing Fields'],
            datasets: [{
                data: [
                    this.analytics.byType.VALUE_DIFFERENCE || 0,
                    this.analytics.byType.RECORD_MISSING || 0,
                    this.analytics.byType.FIELD_MISSING || 0
                ],
                backgroundColor: ['#1589EE', '#FF6384', '#FFA500'],
                borderWidth: 2,
                borderColor: '#fff'
            }]
        };

        // Draw pie chart manually
        this.drawPieChart(typeCtx, typeData, 'Difference Types Distribution');
        charts.typeDistribution = typeCanvas.toBuffer('image/png');

        // 2. Top Objects by Differences (Stacked Bar Chart)
        const objectData = this.analytics.topMismatches.slice(0, 10);

        const objectCanvas = createCanvas(800, 400);
        const objectCtx = objectCanvas.getContext('2d');
        
        const stackedBarData = {
            labels: objectData.map(obj => obj.object),
            datasets: [
                {
                    label: 'Value Differences',
                    data: objectData.map(obj => obj.valueDifferences),
                    backgroundColor: '#1589EE'
                },
                {
                    label: 'Missing Records',
                    data: objectData.map(obj => obj.recordsMissing),
                    backgroundColor: '#FF6384'
                }
            ]
        };

        // Draw stacked bar chart
        this.drawStackedBarChart(objectCtx, stackedBarData, 'Top 10 Objects - Breakdown by Issue Type');
        charts.objectDistribution = objectCanvas.toBuffer('image/png');

        // 3. Org Comparison Chart
        const orgCanvas = createCanvas(600, 400);
        const orgCtx = orgCanvas.getContext('2d');
        
        const orgData = {
            labels: this.analytics.overview.organizations,
            datasets: [
                {
                    label: 'Missing Records',
                    data: this.analytics.overview.organizations.map(org => 
                        this.analytics.byOrg[org]?.missingRecords || 0
                    ),
                    backgroundColor: '#FF6384'
                },
                {
                    label: 'Value Differences',
                    data: this.analytics.overview.organizations.map(org => 
                        this.analytics.byOrg[org]?.valueDifferences || 0
                    ),
                    backgroundColor: '#1589EE'
                }
            ]
        };

        this.drawGroupedBarChart(orgCtx, orgData, 'Issues by Organization');
        charts.orgComparison = orgCanvas.toBuffer('image/png');

        // 4. Data Quality Gauge
        const qualityCanvas = createCanvas(400, 300);
        const qualityCtx = qualityCanvas.getContext('2d');
        
        const matchRate = parseFloat(this.analytics.dataQuality.matchRate);
        this.drawDataQualityGauge(qualityCtx, matchRate);
        charts.dataQuality = qualityCanvas.toBuffer('image/png');

        // 5. Field Analysis Heatmap
        const fieldCanvas = createCanvas(800, 600);
        const fieldCtx = fieldCanvas.getContext('2d');
        this.drawFieldHeatmap(fieldCtx);
        charts.fieldHeatmap = fieldCanvas.toBuffer('image/png');

        // 6. Object Completeness Chart
        const completenessCanvas = createCanvas(800, 400);
        const completenessCtx = completenessCanvas.getContext('2d');
        this.drawCompletenessChart(completenessCtx);
        charts.completeness = completenessCanvas.toBuffer('image/png');

        // 7. Difference Trend by Object Size
        const trendCanvas = createCanvas(800, 400);
        const trendCtx = trendCanvas.getContext('2d');
        this.drawDifferenceTrendChart(trendCtx);
        charts.differenceTrend = trendCanvas.toBuffer('image/png');

        // 8. Organization Comparison Radar Chart
        const radarCanvas = createCanvas(600, 600);
        const radarCtx = radarCanvas.getContext('2d');
        this.drawOrgRadarChart(radarCtx);
        charts.orgRadar = radarCanvas.toBuffer('image/png');

        // 9. Top Fields with Issues
        const fieldIssuesCanvas = createCanvas(800, 400);
        const fieldIssuesCtx = fieldIssuesCanvas.getContext('2d');
        this.drawFieldIssuesChart(fieldIssuesCtx);
        charts.fieldIssues = fieldIssuesCanvas.toBuffer('image/png');

        // 10. Missing Records Timeline
        const timelineCanvas = createCanvas(800, 400);
        const timelineCtx = timelineCanvas.getContext('2d');
        this.drawMissingRecordsTimeline(timelineCtx);
        charts.missingTimeline = timelineCanvas.toBuffer('image/png');

        return charts;
    }
    
    drawPieChart(ctx, data, title) {
        const centerX = 200;
        const centerY = 200;
        const radius = 120;
        let currentAngle = -Math.PI / 2; // Start at top
        
        // Draw title
        ctx.fillStyle = '#333';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(title, centerX, 30);
        
        // Calculate total
        const total = data.datasets[0].data.reduce((sum, val) => sum + val, 0);
        
        if (total === 0) {
            ctx.fillStyle = '#666';
            ctx.font = '14px Arial';
            ctx.fillText('No data available', centerX, centerY);
            return;
        }
        
        // Draw slices
        data.datasets[0].data.forEach((value, index) => {
            if (value > 0) {
                const sliceAngle = (value / total) * 2 * Math.PI;
                
                // Draw slice
                ctx.beginPath();
                ctx.moveTo(centerX, centerY);
                ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle);
                ctx.closePath();
                ctx.fillStyle = data.datasets[0].backgroundColor[index];
                ctx.fill();
                ctx.strokeStyle = data.datasets[0].borderColor;
                ctx.lineWidth = data.datasets[0].borderWidth;
                ctx.stroke();
                
                // Draw label
                const labelAngle = currentAngle + sliceAngle / 2;
                const labelX = centerX + Math.cos(labelAngle) * (radius + 30);
                const labelY = centerY + Math.sin(labelAngle) * (radius + 30);
                
                ctx.fillStyle = '#333';
                ctx.font = '12px Arial';
                ctx.textAlign = 'center';
                const percentage = ((value / total) * 100).toFixed(1);
                ctx.fillText(`${data.labels[index]}`, labelX, labelY - 5);
                ctx.fillText(`${percentage}%`, labelX, labelY + 10);
                
                currentAngle += sliceAngle;
            }
        });
    }
    
    drawStackedBarChart(ctx, data, title) {
        const width = 800;
        const height = 400;
        const padding = 60;
        const barWidth = (width - 2 * padding) / data.labels.length;
        
        // Clear and setup
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, width, height);
        
        // Title
        ctx.fillStyle = '#333';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(title, width / 2, 30);
        
        // Calculate max value
        const maxValue = Math.max(...data.labels.map((_, i) => 
            data.datasets.reduce((sum, dataset) => sum + (dataset.data[i] || 0), 0)
        ));
        
        if (maxValue === 0) {
            ctx.fillStyle = '#666';
            ctx.font = '14px Arial';
            ctx.fillText('No data available', width / 2, height / 2);
            return;
        }
        
        // Draw bars
        data.labels.forEach((label, i) => {
            let currentHeight = 0;
            
            data.datasets.forEach(dataset => {
                const value = dataset.data[i] || 0;
                const barHeight = (value / maxValue) * (height - 2 * padding);
                
                ctx.fillStyle = dataset.backgroundColor;
                ctx.fillRect(
                    padding + i * barWidth + barWidth * 0.1,
                    height - padding - currentHeight - barHeight,
                    barWidth * 0.8,
                    barHeight
                );
                
                currentHeight += barHeight;
            });
            
            // X-axis labels
            ctx.fillStyle = '#333';
            ctx.font = '10px Arial';
            ctx.textAlign = 'center';
            ctx.save();
            ctx.translate(padding + i * barWidth + barWidth / 2, height - padding + 10);
            ctx.rotate(-45 * Math.PI / 180);
            ctx.fillText(label.substring(0, 15) + (label.length > 15 ? '...' : ''), 0, 0);
            ctx.restore();
        });
        
        // Y-axis
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(padding, padding);
        ctx.lineTo(padding, height - padding);
        ctx.lineTo(width - padding, height - padding);
        ctx.stroke();
        
        // Y-axis labels
        for (let i = 0; i <= 5; i++) {
            const y = height - padding - (i / 5) * (height - 2 * padding);
            const value = Math.round((i / 5) * maxValue);
            
            ctx.fillStyle = '#333';
            ctx.font = '10px Arial';
            ctx.textAlign = 'right';
            ctx.fillText(value.toString(), padding - 10, y + 3);
            
            // Grid lines
            if (i > 0) {
                ctx.strokeStyle = '#ddd';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(padding, y);
                ctx.lineTo(width - padding, y);
                ctx.stroke();
            }
        }
        
        // Legend
        let legendY = 50;
        data.datasets.forEach(dataset => {
            ctx.fillStyle = dataset.backgroundColor;
            ctx.fillRect(width - 150, legendY, 15, 15);
            
            ctx.fillStyle = '#333';
            ctx.font = '12px Arial';
            ctx.textAlign = 'left';
            ctx.fillText(dataset.label, width - 130, legendY + 12);
            
            legendY += 20;
        });
    }
    
    drawGroupedBarChart(ctx, data, title) {
        const width = 600;
        const height = 400;
        const padding = 60;
        const groupWidth = (width - 2 * padding) / data.labels.length;
        const barWidth = groupWidth / (data.datasets.length + 1);
        
        // Clear and setup
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, width, height);
        
        // Title
        ctx.fillStyle = '#333';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(title, width / 2, 30);
        
        // Calculate max value
        const maxValue = Math.max(...data.datasets.flatMap(dataset => dataset.data));
        
        if (maxValue === 0) {
            ctx.fillStyle = '#666';
            ctx.font = '14px Arial';
            ctx.fillText('No data available', width / 2, height / 2);
            return;
        }
        
        // Draw bars
        data.labels.forEach((label, groupIndex) => {
            data.datasets.forEach((dataset, datasetIndex) => {
                const value = dataset.data[groupIndex] || 0;
                const barHeight = (value / maxValue) * (height - 2 * padding);
                const x = padding + groupIndex * groupWidth + datasetIndex * barWidth + barWidth * 0.1;
                const y = height - padding - barHeight;
                
                ctx.fillStyle = dataset.backgroundColor;
                ctx.fillRect(x, y, barWidth * 0.8, barHeight);
            });
            
            // X-axis labels
            ctx.fillStyle = '#333';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(label, padding + groupIndex * groupWidth + groupWidth / 2, height - padding + 20);
        });
        
        // Axes
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(padding, padding);
        ctx.lineTo(padding, height - padding);
        ctx.lineTo(width - padding, height - padding);
        ctx.stroke();
        
        // Y-axis labels
        for (let i = 0; i <= 5; i++) {
            const y = height - padding - (i / 5) * (height - 2 * padding);
            const value = Math.round((i / 5) * maxValue);
            
            ctx.fillStyle = '#333';
            ctx.font = '10px Arial';
            ctx.textAlign = 'right';
            ctx.fillText(value.toString(), padding - 10, y + 3);
            
            // Grid lines
            if (i > 0) {
                ctx.strokeStyle = '#ddd';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(padding, y);
                ctx.lineTo(width - padding, y);
                ctx.stroke();
            }
        }
        
        // Legend
        let legendY = 50;
        data.datasets.forEach(dataset => {
            ctx.fillStyle = dataset.backgroundColor;
            ctx.fillRect(width - 150, legendY, 15, 15);
            
            ctx.fillStyle = '#333';
            ctx.font = '12px Arial';
            ctx.textAlign = 'left';
            ctx.fillText(dataset.label, width - 130, legendY + 12);
            
            legendY += 20;
        });
    }
    
    drawDataQualityGauge(ctx, matchRate) {
        const centerX = 200;
        const centerY = 200;
        const radius = 120;
        
        // Background circle
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, Math.PI * 0.75, Math.PI * 2.25);
        ctx.strokeStyle = '#e0e0e0';
        ctx.lineWidth = 20;
        ctx.stroke();
        
        // Progress arc
        const endAngle = Math.PI * 0.75 + (matchRate / 100) * Math.PI * 1.5;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, Math.PI * 0.75, endAngle);
        ctx.strokeStyle = matchRate > 90 ? '#34C759' : matchRate > 80 ? '#FF9500' : '#FF3B30';
        ctx.lineWidth = 20;
        ctx.stroke();
        
        // Center text
        ctx.fillStyle = '#333';
        ctx.font = 'bold 48px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${matchRate.toFixed(0)}%`, centerX, centerY);
        
        // Label
        ctx.font = '14px Arial';
        ctx.fillStyle = '#666';
        ctx.fillText('Match Rate', centerX, centerY + 30);
        
        // Quality label
        const quality = matchRate > 90 ? 'EXCELLENT' : matchRate > 80 ? 'GOOD' : 'NEEDS ATTENTION';
        ctx.font = 'bold 20px Arial';
        ctx.fillStyle = matchRate > 90 ? '#34C759' : matchRate > 80 ? '#FF9500' : '#FF3B30';
        ctx.fillText(quality, centerX, centerY + 60);
    }

    drawFieldHeatmap(ctx) {
        const width = 800;
        const height = 600;
        const padding = 60;
        
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, width, height);
        
        ctx.fillStyle = '#333';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Field-Level Difference Heatmap', width / 2, 30);
        
        const topObjects = this.analytics.topMismatches.slice(0, 8);
        const cellSize = 40;
        const startX = padding;
        const startY = padding + 30;
        
        topObjects.forEach((obj, i) => {
            const y = startY + i * (cellSize + 5);
            const intensity = obj.percentageOfTotal / 30;
            const colorValue = Math.max(0, Math.min(255, Math.floor(255 * intensity)));
            
            ctx.fillStyle = `rgb(${colorValue}, ${50}, ${255 - colorValue})`;
            ctx.fillRect(startX, y, width - 2 * padding, cellSize);
            
            ctx.fillStyle = 'white';
            ctx.font = '12px Arial';
            ctx.textAlign = 'left';
            ctx.fillText(`${obj.object}: ${obj.totalDifferences} differences (${obj.percentageOfTotal}%)`, startX + 10, y + 25);
        });
        
        ctx.fillStyle = '#666';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Color intensity indicates percentage of total differences', width / 2, height - 20);
    }

    drawCompletenessChart(ctx) {
        const width = 800;
        const height = 400;
        const padding = 60;
        
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, width, height);
        
        ctx.fillStyle = '#333';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Data Completeness by Organization', width / 2, 30);
        
        const orgs = this.analytics.overview.organizations;
        const barWidth = (width - 2 * padding) / orgs.length;
        
        orgs.forEach((org, i) => {
            const completeness = parseFloat(this.analytics.dataQuality.completenessScore[org]) || 100;
            const barHeight = (completeness / 100) * (height - 2 * padding);
            const x = padding + i * barWidth + barWidth * 0.2;
            const y = height - padding - barHeight;
            
            const color = completeness >= 95 ? '#34C759' : completeness >= 85 ? '#FF9500' : '#FF3B30';
            ctx.fillStyle = color;
            ctx.fillRect(x, y, barWidth * 0.6, barHeight);
            
            ctx.fillStyle = '#333';
            ctx.font = 'bold 14px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(`${completeness.toFixed(1)}%`, x + barWidth * 0.3, y - 10);
            
            ctx.font = '12px Arial';
            ctx.fillText(org, x + barWidth * 0.3, height - padding + 20);
        });
        
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(padding, padding);
        ctx.lineTo(padding, height - padding);
        ctx.lineTo(width - padding, height - padding);
        ctx.stroke();
    }

    drawDifferenceTrendChart(ctx) {
        const width = 800;
        const height = 400;
        const padding = 60;
        
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, width, height);
        
        ctx.fillStyle = '#333';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Difference Distribution by Object Size', width / 2, 30);
        
        const topObjects = this.analytics.topMismatches.slice(0, 10);
        const maxDiff = Math.max(...topObjects.map(obj => obj.totalDifferences));
        
        if (maxDiff === 0) {
            ctx.fillStyle = '#666';
            ctx.font = '14px Arial';
            ctx.fillText('No data available', width / 2, height / 2);
            return;
        }
        
        ctx.strokeStyle = '#1589EE';
        ctx.lineWidth = 3;
        ctx.beginPath();
        
        topObjects.forEach((obj, i) => {
            const x = padding + (i / (topObjects.length - 1)) * (width - 2 * padding);
            const y = height - padding - (obj.totalDifferences / maxDiff) * (height - 2 * padding);
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
            
            ctx.fillStyle = '#1589EE';
            ctx.beginPath();
            ctx.arc(x, y, 5, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.fillStyle = '#666';
            ctx.font = '10px Arial';
            ctx.save();
            ctx.translate(x, height - padding + 10);
            ctx.rotate(-45 * Math.PI / 180);
            ctx.fillText(obj.object.substring(0, 10), 0, 0);
            ctx.restore();
        });
        
        ctx.stroke();
        
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(padding, padding);
        ctx.lineTo(padding, height - padding);
        ctx.lineTo(width - padding, height - padding);
        ctx.stroke();
    }

    drawOrgRadarChart(ctx) {
        const centerX = 300;
        const centerY = 300;
        const radius = 200;
        const levels = 5;
        
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, 600, 600);
        
        ctx.fillStyle = '#333';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Organization Comparison Radar', centerX, 30);
        
        const metrics = ['Missing Records', 'Value Differences', 'Data Quality', 'Completeness', 'Total Issues'];
        const angleStep = (Math.PI * 2) / metrics.length;
        
        for (let level = 1; level <= levels; level++) {
            ctx.strokeStyle = '#e0e0e0';
            ctx.lineWidth = 1;
            ctx.beginPath();
            
            for (let i = 0; i <= metrics.length; i++) {
                const angle = i * angleStep - Math.PI / 2;
                const x = centerX + Math.cos(angle) * radius * (level / levels);
                const y = centerY + Math.sin(angle) * radius * (level / levels);
                
                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.stroke();
        }
        
        for (let i = 0; i < metrics.length; i++) {
            const angle = i * angleStep - Math.PI / 2;
            ctx.strokeStyle = '#e0e0e0';
            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.lineTo(
                centerX + Math.cos(angle) * radius,
                centerY + Math.sin(angle) * radius
            );
            ctx.stroke();
            
            ctx.fillStyle = '#333';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            const labelX = centerX + Math.cos(angle) * (radius + 20);
            const labelY = centerY + Math.sin(angle) * (radius + 20);
            ctx.fillText(metrics[i], labelX, labelY);
        }
        
        this.analytics.overview.organizations.forEach((org, orgIndex) => {
            const orgData = this.analytics.byOrg[org];
            const values = [
                Math.min(100, (orgData.missingRecords / 100) * 100),
                Math.min(100, (orgData.valueDifferences / 100) * 100),
                parseFloat(this.analytics.dataQuality.matchRate) || 0,
                parseFloat(this.analytics.dataQuality.completenessScore[org]) || 100,
                Math.min(100, (orgData.totalIssues / 100) * 100)
            ];
            
            ctx.strokeStyle = orgIndex === 0 ? '#1589EE' : '#FF6384';
            ctx.fillStyle = orgIndex === 0 ? 'rgba(21, 137, 238, 0.2)' : 'rgba(255, 99, 132, 0.2)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            
            values.forEach((value, i) => {
                const angle = i * angleStep - Math.PI / 2;
                const r = (value / 100) * radius;
                const x = centerX + Math.cos(angle) * r;
                const y = centerY + Math.sin(angle) * r;
                
                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            });
            
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        });
        
        let legendY = 550;
        this.analytics.overview.organizations.forEach((org, i) => {
            ctx.fillStyle = i === 0 ? '#1589EE' : '#FF6384';
            ctx.fillRect(50, legendY, 15, 15);
            ctx.fillStyle = '#333';
            ctx.font = '12px Arial';
            ctx.textAlign = 'left';
            ctx.fillText(org, 70, legendY + 12);
            legendY += 20;
        });
    }

    drawFieldIssuesChart(ctx) {
        const width = 800;
        const height = 400;
        const padding = 60;
        
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, width, height);
        
        ctx.fillStyle = '#333';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Top Fields with Configuration Issues', width / 2, 30);
        
        const fieldIssues = {};
        this.differences.forEach(diff => {
            const field = (diff.ObjectFieldName || '').split('.')[1] || 'Unknown';
            if (field && field !== 'Unknown') {
                fieldIssues[field] = (fieldIssues[field] || 0) + 1;
            }
        });
        
        const topFields = Object.entries(fieldIssues)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);
        
        if (topFields.length === 0) {
            ctx.fillStyle = '#666';
            ctx.font = '14px Arial';
            ctx.fillText('No field data available', width / 2, height / 2);
            return;
        }
        
        const barHeight = (height - 2 * padding) / topFields.length;
        const maxCount = Math.max(...topFields.map(f => f[1]));
        
        topFields.forEach(([field, count], i) => {
            const barWidth = (count / maxCount) * (width - 2 * padding - 150);
            const y = padding + i * barHeight;
            
            ctx.fillStyle = '#1589EE';
            ctx.fillRect(padding + 150, y + barHeight * 0.2, barWidth, barHeight * 0.6);
            
            ctx.fillStyle = '#333';
            ctx.font = '11px Arial';
            ctx.textAlign = 'right';
            ctx.fillText(field.substring(0, 20), padding + 140, y + barHeight * 0.5 + 4);
            
            ctx.textAlign = 'left';
            ctx.fillText(count.toString(), padding + 160 + barWidth, y + barHeight * 0.5 + 4);
        });
        
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(padding + 150, padding);
        ctx.lineTo(padding + 150, height - padding);
        ctx.lineTo(width - padding, height - padding);
        ctx.stroke();
    }

    drawMissingRecordsTimeline(ctx) {
        const width = 800;
        const height = 400;
        const padding = 60;
        
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, width, height);
        
        ctx.fillStyle = '#333';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Missing Records Distribution', width / 2, 30);
        
        const missingByObject = Object.entries(this.analytics.byObject)
            .filter(([_, data]) => data.recordsMissing > 0)
            .sort((a, b) => b[1].recordsMissing - a[1].recordsMissing)
            .slice(0, 8);
        
        if (missingByObject.length === 0) {
            ctx.fillStyle = '#666';
            ctx.font = '14px Arial';
            ctx.fillText('No missing records found', width / 2, height / 2);
            return;
        }
        
        const barWidth = (width - 2 * padding) / missingByObject.length;
        const maxMissing = Math.max(...missingByObject.map(([_, data]) => data.recordsMissing));
        
        missingByObject.forEach(([objName, data], i) => {
            const barHeight = (data.recordsMissing / maxMissing) * (height - 2 * padding);
            const x = padding + i * barWidth;
            const y = height - padding - barHeight;
            
            const gradient = ctx.createLinearGradient(0, y, 0, height - padding);
            gradient.addColorStop(0, '#FF6384');
            gradient.addColorStop(1, '#FF3B30');
            
            ctx.fillStyle = gradient;
            ctx.fillRect(x + barWidth * 0.1, y, barWidth * 0.8, barHeight);
            
            ctx.fillStyle = '#333';
            ctx.font = 'bold 12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(data.recordsMissing.toString(), x + barWidth / 2, y - 10);
            
            ctx.font = '10px Arial';
            ctx.save();
            ctx.translate(x + barWidth / 2, height - padding + 10);
            ctx.rotate(-45 * Math.PI / 180);
            ctx.fillText(objName.substring(0, 15), 0, 0);
            ctx.restore();
        });
        
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(padding, padding);
        ctx.lineTo(padding, height - padding);
        ctx.lineTo(width - padding, height - padding);
        ctx.stroke();
        
        ctx.fillStyle = '#666';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Objects with Missing Records', width / 2, height - 5);
    }
}

module.exports = { ReportAnalytics };
