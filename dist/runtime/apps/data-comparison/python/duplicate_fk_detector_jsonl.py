#!/usr/bin/env python3
"""
Duplicate Foreign Key Detector for CPQ Toolset - JSONL Version
Detects duplicate foreign keys within individual orgs in JSONL files before parquet conversion
"""

import json
import os
import sys
import logging
from collections import defaultdict
from pathlib import Path

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class DuplicateFKDetectorJSONL:
    def __init__(self, comparison_dir, config_path):
        self.comparison_dir = Path(comparison_dir)
        self.config_path = Path(config_path)
        self.config = self.load_config()
        self.foreign_key_mappings = self.extract_foreign_key_mappings()
        self.duplicates = {}
        
    def load_config(self):
        """Load configuration from JSON file"""
        try:
            with open(self.config_path, 'r') as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Failed to load config from {self.config_path}: {e}")
            return {}
    
    def extract_foreign_key_mappings(self):
        """Extract foreign key mappings from config"""
        mappings = {}
        
        if 'objects' in self.config:
            for obj_name, obj_config in self.config['objects'].items():
                if 'foreignKey' in obj_config:
                    mappings[obj_name] = obj_config['foreignKey']
                    logger.info(f"Found foreign key for {obj_name}: {obj_config['foreignKey']}")
        
        logger.info(f"Extracted {len(mappings)} foreign key mappings from config")
        return mappings
    
    def detect_duplicates_in_org(self, org_name, org_dir):
        """Detect duplicate foreign keys within a single org from JSONL files"""
        org_duplicates = {}
        
        for object_name, foreign_key_field in self.foreign_key_mappings.items():
            jsonl_file = org_dir / f"{object_name}.jsonl"
            
            if not jsonl_file.exists():
                logger.warning(f"JSONL file not found: {jsonl_file}")
                continue
            
            logger.info(f"Checking duplicates in {org_name}/{object_name}")
            
            try:
                # Read JSONL file and track foreign keys
                fk_records = defaultdict(list)
                line_number = 1
                
                with open(jsonl_file, 'r', encoding='utf-8') as f:
                    for line in f:
                        if not line.strip():
                            continue
                            
                        try:
                            record = json.loads(line)
                            
                            # Get foreign key value
                            fk_value = record.get(foreign_key_field)
                            
                            # Skip null/empty foreign keys
                            if fk_value is None or fk_value == '':
                                line_number += 1
                                continue
                            
                            # Store record with its line number
                            fk_records[str(fk_value)].append({
                                'line_number': line_number,
                                'record': record
                            })
                            
                            line_number += 1
                            
                        except json.JSONDecodeError as e:
                            logger.error(f"Failed to parse JSON at line {line_number}: {e}")
                            line_number += 1
                            continue
                
                # Find duplicates
                object_duplicates = {}
                for fk_value, records in fk_records.items():
                    if len(records) > 1:
                        object_duplicates[fk_value] = {
                            'foreign_key': fk_value,
                            'count': len(records),
                            'records': records
                        }
                
                if object_duplicates:
                    org_duplicates[object_name] = object_duplicates
                    logger.warning(f"Found {len(object_duplicates)} duplicate foreign keys in {org_name}/{object_name}")
                else:
                    logger.info(f"No duplicates found in {org_name}/{object_name}")
                    
            except Exception as e:
                logger.error(f"Error processing {jsonl_file}: {e}")
                continue
        
        return org_duplicates
    
    def detect_all_duplicates(self):
        """Detect duplicates across all orgs"""
        logger.info("Starting duplicate foreign key detection across all orgs")
        
        # Find all org directories
        for item in self.comparison_dir.iterdir():
            if item.is_dir() and not item.name.startswith('.'):
                org_name = item.name
                logger.info(f"Processing org: {org_name}")
                
                org_duplicates = self.detect_duplicates_in_org(org_name, item)
                
                if org_duplicates:
                    self.duplicates[org_name] = org_duplicates
                    logger.warning(f"Found duplicates in org {org_name}: {len(org_duplicates)} objects affected")
                else:
                    logger.info(f"No duplicates found in org {org_name}")
        
        return self.duplicates
    
    def generate_duplicate_report(self):
        """Generate a comprehensive report of all duplicates"""
        if not self.duplicates:
            return {
                'summary': {
                    'total_orgs_with_duplicates': 0,
                    'total_objects_with_duplicates': 0,
                    'total_duplicate_fks': 0,
                    'requires_resolution': False
                },
                'duplicates': {}
            }
        
        total_objects = 0
        total_duplicate_fks = 0
        
        # Create detailed report
        detailed_report = {}
        
        for org_name, org_duplicates in self.duplicates.items():
            org_report = {
                'org_name': org_name,
                'objects_with_duplicates': len(org_duplicates),
                'objects': {}
            }
            
            for object_name, object_duplicates in org_duplicates.items():
                object_report = {
                    'object_name': object_name,
                    'foreign_key_field': self.foreign_key_mappings.get(object_name, 'Unknown'),
                    'duplicate_count': len(object_duplicates),
                    'duplicates': {}
                }
                
                for fk_value, duplicate_info in object_duplicates.items():
                    # Calculate differences between duplicate records
                    records = duplicate_info['records']
                    differences = self.calculate_record_differences(records)
                    
                    object_report['duplicates'][fk_value] = {
                        'foreign_key': fk_value,
                        'record_count': len(records),
                        'records': [
                            {
                                'line_number': rec['line_number'],
                                'record_id': rec['record'].get('Id', 'Unknown'),
                                'record_data': rec['record']
                            }
                            for rec in records
                        ],
                        'differences': differences
                    }
                    
                    total_duplicate_fks += 1
                
                org_report['objects'][object_name] = object_report
                total_objects += 1
            
            detailed_report[org_name] = org_report
        
        report = {
            'summary': {
                'total_orgs_with_duplicates': len(self.duplicates),
                'total_objects_with_duplicates': total_objects,
                'total_duplicate_fks': total_duplicate_fks,
                'requires_resolution': total_duplicate_fks > 0
            },
            'duplicates': detailed_report
        }
        
        return report
    
    def calculate_record_differences(self, records):
        """Calculate differences between duplicate records"""
        if len(records) < 2:
            return []
        
        differences = []
        base_record = records[0]['record']
        
        for i in range(1, len(records)):
            compare_record = records[i]['record']
            record_diff = {}
            
            # Find fields that differ
            all_fields = set(base_record.keys()) | set(compare_record.keys())
            
            for field in all_fields:
                base_value = base_record.get(field)
                compare_value = compare_record.get(field)
                
                if base_value != compare_value:
                    record_diff[field] = {
                        'base_value': base_value,
                        'compare_value': compare_value
                    }
            
            if record_diff:
                differences.append({
                    'base_record_line': records[0]['line_number'],
                    'compare_record_line': records[i]['line_number'],
                    'different_fields': record_diff
                })
        
        return differences
    
    def save_report(self, output_path):
        """Save the duplicate report to a JSON file"""
        report = self.generate_duplicate_report()
        
        try:
            with open(output_path, 'w') as f:
                json.dump(report, f, indent=2, default=str)
            
            logger.info(f"Duplicate report saved to: {output_path}")
            return True
        except Exception as e:
            logger.error(f"Failed to save report to {output_path}: {e}")
            return False
    
    def get_resolution_recommendations(self):
        """Generate recommendations for resolving duplicates"""
        if not self.duplicates:
            return []
        
        recommendations = []
        
        for org_name, org_duplicates in self.duplicates.items():
            for object_name, object_duplicates in org_duplicates.items():
                fk_field = self.foreign_key_mappings.get(object_name, 'Unknown')
                
                recommendation = {
                    'org': org_name,
                    'object': object_name,
                    'foreign_key_field': fk_field,
                    'duplicate_count': len(object_duplicates),
                    'action': 'require_resolution',
                    'message': f"Object {object_name} in org {org_name} has {len(object_duplicates)} duplicate {fk_field} values that must be resolved before comparison"
                }
                
                recommendations.append(recommendation)
        
        return recommendations

def main():
    if len(sys.argv) != 3:
        print("Usage: python duplicate_fk_detector_jsonl.py <comparison_dir> <config_path>")
        sys.exit(1)
    
    comparison_dir = sys.argv[1]
    config_path = sys.argv[2]
    
    detector = DuplicateFKDetectorJSONL(comparison_dir, config_path)
    
    # Detect duplicates
    duplicates = detector.detect_all_duplicates()
    
    # Generate and save report
    report_path = Path(comparison_dir) / "duplicate_fk_report.json"
    detector.save_report(report_path)
    
    # Print summary
    report = detector.generate_duplicate_report()
    summary = report['summary']
    
    print(f"\n🔍 Duplicate Foreign Key Detection Complete!")
    print(f"📊 Summary:")
    print(f"  - Orgs with duplicates: {summary['total_orgs_with_duplicates']}")
    print(f"  - Objects with duplicates: {summary['total_objects_with_duplicates']}")
    print(f"  - Total duplicate FKs: {summary['total_duplicate_fks']}")
    
    if summary['total_duplicate_fks'] > 0:
        print(f"\n⚠️  Duplicate foreign keys detected! Review the report at: {report_path}")
        print("\n📝 Recommendations:")
        recommendations = detector.get_resolution_recommendations()
        for rec in recommendations:
            print(f"  - {rec['message']}")
        return 1  # Exit with error code to indicate duplicates found
    else:
        print(f"\n✅ No duplicate foreign keys found!")
        return 0

if __name__ == "__main__":
    sys.exit(main())