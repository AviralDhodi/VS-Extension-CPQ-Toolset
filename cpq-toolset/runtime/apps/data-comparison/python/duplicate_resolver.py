#!/usr/bin/env python3
"""
Duplicate Foreign Key Resolver for CPQ Toolset
Applies user resolutions to JSONL files by removing unwanted duplicate records
"""

import json
import os
import sys
import logging
import shutil
from pathlib import Path
from collections import defaultdict

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class DuplicateResolver:
    def __init__(self, comparison_dir, resolutions_file):
        self.comparison_dir = Path(comparison_dir)
        self.resolutions_file = Path(resolutions_file)
        self.resolutions = self.load_resolutions()
        self.blacklisted_fks = set()
        self.resolved_count = 0
        self.skipped_count = 0
        self.foreign_key_mappings = self.load_foreign_key_config()
        
    def load_resolutions(self):
        """Load user resolutions from JSON file"""
        try:
            with open(self.resolutions_file, 'r') as f:
                resolutions = json.load(f)
                logger.info(f"Loaded {len(resolutions)} user resolutions")
                return resolutions
        except Exception as e:
            logger.error(f"Failed to load resolutions from {self.resolutions_file}: {e}")
            return {}
    
    def load_foreign_key_config(self):
        """Load foreign key mappings from configuration file"""
        config_files = [f for f in os.listdir(self.comparison_dir) if f.startswith('config_') and f.endswith('.json')]
        
        if not config_files:
            logger.warning("No config file found - using default FK detection")
            return {}
        
        config_file = self.comparison_dir / config_files[0]
        logger.info(f"Loading FK config from: {config_files[0]}")
        
        try:
            with open(config_file, 'r') as f:
                config = json.load(f)
            
            # Extract foreign key mappings from objects dictionary
            mappings = {}
            objects_config = config.get('objects', {})
            for obj_name, obj_config in objects_config.items():
                if isinstance(obj_config, dict) and 'foreignKey' in obj_config:
                    foreign_key = obj_config['foreignKey']
                    mappings[obj_name] = foreign_key
                    logger.info(f"FK mapping: {obj_name} → {foreign_key}")
            
            logger.info(f"Loaded {len(mappings)} foreign key mappings from config")
            return mappings
            
        except Exception as e:
            logger.error(f"Error loading config: {e}")
            return {}
    
    def apply_resolutions(self):
        """Apply all user resolutions to JSONL files"""
        logger.info("Starting duplicate resolution process")
        
        for resolution_key, resolution_data in self.resolutions.items():
            try:
                self.apply_single_resolution(resolution_key, resolution_data)
            except Exception as e:
                logger.error(f"Failed to apply resolution for {resolution_key}: {e}")
                continue
        
        # Save blacklisted foreign keys for comparison engine
        self.save_blacklisted_fks()
        
        logger.info(f"Resolution complete: {self.resolved_count} resolved, {self.skipped_count} skipped")
        return True
    
    def apply_single_resolution(self, resolution_key, resolution_data):
        """Apply a single user resolution"""
        # Parse resolution key: org_name:object_name:foreign_key_value
        parts = resolution_key.split(':')
        if len(parts) != 3:
            logger.warning(f"Invalid resolution key format: {resolution_key}")
            return
        
        org_name, object_name, fk_value = parts
        action = resolution_data.get('action')  # 'choose', 'skip'
        chosen_record_line = resolution_data.get('chosen_line_number')
        
        logger.info(f"Applying resolution: {org_name}/{object_name} FK={fk_value} Action={action}")
        logger.info(f"Resolution data: {resolution_data}")
        
        if action == 'skip':
            # Add to blacklist
            self.blacklisted_fks.add(f"{object_name}:{fk_value}")
            self.skipped_count += 1
            logger.info(f"Blacklisted FK: {object_name}:{fk_value}")
            return
        
        if action == 'choose' and chosen_record_line:
            # Remove all other records with this FK, keep only the chosen one
            self.remove_duplicate_records(org_name, object_name, fk_value, chosen_record_line)
            self.resolved_count += 1
        else:
            logger.warning(f"Invalid resolution action or missing chosen_line_number: {resolution_data}")
    
    def remove_duplicate_records(self, org_name, object_name, fk_value, keep_line_number):
        """Remove duplicate records, keeping only the chosen one"""
        org_dir = self.comparison_dir / org_name
        jsonl_file = org_dir / f"{object_name}.jsonl"
        
        if not jsonl_file.exists():
            logger.warning(f"JSONL file not found: {jsonl_file}")
            return
        
        logger.info(f"Processing file: {jsonl_file}")
        logger.info(f"Looking for FK value: {fk_value} (keeping line {keep_line_number})")
        
        # Create backup
        backup_file = jsonl_file.with_suffix('.jsonl.backup')
        shutil.copy2(jsonl_file, backup_file)
        logger.info(f"Created backup: {backup_file}")
        
        # Read all records
        records = []
        removed_count = 0
        found_matches = []
        
        try:
            with open(jsonl_file, 'r') as f:
                for line_num, line in enumerate(f, 1):
                    try:
                        record = json.loads(line.strip())
                        
                        # Check if this record has the duplicate FK
                        record_fk = self.get_foreign_key_value(record, object_name)
                        
                        if record_fk == fk_value:
                            found_matches.append(line_num)
                            logger.info(f"Found matching FK {fk_value} at line {line_num}")
                            
                            if line_num == keep_line_number:
                                # Keep this record
                                records.append(line.strip())
                                logger.info(f"✅ Keeping record at line {line_num}")
                            else:
                                # Remove this duplicate
                                removed_count += 1
                                logger.info(f"❌ Removing duplicate record at line {line_num}")
                        else:
                            # Keep all non-duplicate records
                            records.append(line.strip())
                            
                    except json.JSONDecodeError as e:
                        logger.warning(f"Invalid JSON on line {line_num}: {e}")
                        # Keep invalid lines as-is
                        records.append(line.strip())
                        continue
            
            logger.info(f"Found {len(found_matches)} matching records at lines: {found_matches}")
            logger.info(f"Removed {removed_count} duplicates, kept 1 record")
            
            # Write back the filtered records
            with open(jsonl_file, 'w') as f:
                for record_line in records:
                    f.write(record_line + '\n')
            
            logger.info(f"Resolved duplicate FK {fk_value} in {org_name}/{object_name}: removed {removed_count} duplicates")
            
        except Exception as e:
            logger.error(f"Error processing {jsonl_file}: {e}")
            # Restore backup on error
            if backup_file.exists():
                shutil.copy2(backup_file, jsonl_file)
                logger.info(f"Restored backup for {jsonl_file}")
            raise
    
    def get_foreign_key_value(self, record, object_name):
        """Get foreign key value from record based on object configuration"""
        # First try configured foreign key field
        if object_name in self.foreign_key_mappings:
            fk_field = self.foreign_key_mappings[object_name]
            if fk_field in record:
                return record[fk_field]
        
        # Fallback to common patterns based on object name
        common_fk_fields = []
        
        # Add object-specific patterns
        if object_name == "SBQQ__PriceRule__c":
            common_fk_fields.append("Price_Rule_Foreign_Key__c")
        elif object_name == "SBQQ__PriceCondition__c":
            common_fk_fields.append("Price_Condition_Foreign_Key__c")
        elif object_name == "SBQQ__PriceAction__c":
            common_fk_fields.append("Price_Action_Foreign_Key__c")
        
        # Add generic patterns
        common_fk_fields.extend([
            f"{object_name}_Foreign_Key__c",
            "Foreign_Key__c", 
            "Id"
        ])
        
        for field in common_fk_fields:
            if field in record:
                return record[field]
        
        logger.warning(f"Could not find foreign key field for {object_name} in record with keys: {list(record.keys())}")
        return None
    
    def save_blacklisted_fks(self):
        """Save blacklisted foreign keys for the comparison engine"""
        blacklist_file = self.comparison_dir / "blacklisted_foreign_keys.json"
        
        blacklist_data = {
            'blacklisted_fks': list(self.blacklisted_fks),
            'generated_at': json.dumps(None, default=str),  # Will be handled by JSON serializer
            'total_count': len(self.blacklisted_fks)
        }
        
        try:
            with open(blacklist_file, 'w') as f:
                json.dump(blacklist_data, f, indent=2, default=str)
            
            logger.info(f"Saved {len(self.blacklisted_fks)} blacklisted FKs to {blacklist_file}")
            
        except Exception as e:
            logger.error(f"Failed to save blacklist: {e}")
    
    def generate_resolution_summary(self):
        """Generate a summary of what was resolved"""
        summary = {
            'total_resolutions_applied': len(self.resolutions),
            'resolved_count': self.resolved_count,
            'skipped_count': self.skipped_count,
            'blacklisted_fks': list(self.blacklisted_fks),
            'processed_at': json.dumps(None, default=str)  # Will be handled by JSON serializer
        }
        
        summary_file = self.comparison_dir / "resolution_summary.json"
        
        try:
            with open(summary_file, 'w') as f:
                json.dump(summary, f, indent=2, default=str)
            
            logger.info(f"Resolution summary saved to {summary_file}")
            return summary
            
        except Exception as e:
            logger.error(f"Failed to save resolution summary: {e}")
            return summary

def main():
    if len(sys.argv) != 3:
        print("Usage: python duplicate_resolver.py <comparison_dir> <resolutions_file>")
        sys.exit(1)
    
    comparison_dir = sys.argv[1]
    resolutions_file = sys.argv[2]
    
    resolver = DuplicateResolver(comparison_dir, resolutions_file)
    
    # Apply resolutions
    success = resolver.apply_resolutions()
    
    # Generate summary
    summary = resolver.generate_resolution_summary()
    
    # Print results
    print(f"\n🔧 Duplicate Resolution Complete!")
    print(f"📊 Summary:")
    print(f"  - Resolutions applied: {summary['total_resolutions_applied']}")
    print(f"  - Records resolved: {summary['resolved_count']}")
    print(f"  - Foreign keys skipped: {summary['skipped_count']}")
    print(f"  - Blacklisted FKs: {len(summary['blacklisted_fks'])}")
    
    if success:
        print(f"✅ All resolutions applied successfully!")
        return 0
    else:
        print(f"⚠️ Some resolutions failed to apply!")
        return 1

if __name__ == "__main__":
    sys.exit(main())