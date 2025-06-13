#!/usr/bin/env python3
# apps/data-comparison/python/multi_org_comparison.py

import os
import sys
import json
import sqlite3
import logging
from datetime import datetime
from pathlib import Path
from collections import defaultdict
from typing import Dict, List, Any, Optional

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='Python output: %(levelname)s: %(message)s'
)
logger = logging.getLogger(__name__)

class MultiOrgComparisonEngine:
    def __init__(self, comparison_id: str, config: Dict[str, Any]):
        """Initialize multi-org comparison handler"""
        try:
            self.comparison_id = comparison_id
            self.config = config
            
            # System fields to exclude from comparison but include in output
            self.system_fields = {
                'CreatedDate', 
                'LastModifiedDate', 
                'CreatedBy.Name',
                'LastModifiedById',
                'CreatedById'
            }
            
            # Setup database path
            project_root = os.getcwd()
            db_dir = os.path.join(project_root, 'tmp')
            os.makedirs(db_dir, exist_ok=True)

            self.db_path = os.path.join(db_dir, f'python_compare_{comparison_id}.db')
            
            # Initialize database with optimized settings
            self.conn = sqlite3.connect(self.db_path)
            self.conn.execute("PRAGMA foreign_keys = ON")
            self.conn.execute("PRAGMA journal_mode = WAL")
            self.conn.execute("PRAGMA synchronous = NORMAL")
            self.conn.execute("PRAGMA cache_size = 50000")  # Increased cache
            self.conn.execute("PRAGMA temp_store = MEMORY")
            
            # Parse orgs and objects
            self.orgs = {org['username']: org for org in config['orgs']}
            self.objects = config.get('objects', {})
            
            logger.info(f"Python engine initialized for {len(self.orgs)} orgs, {len(self.objects)} objects")
            
        except Exception as e:
            logger.error(f"Initialization error: {e}")
            raise

    def create_data_tables(self, object_name: str) -> None:
        """Create optimized tables for large dataset processing"""
        try:
            # Use object name hash for table names to avoid SQL injection
            table_suffix = abs(hash(object_name)) % 10000
            data_table = f"data_{table_suffix}"
            results_table = f"results_{table_suffix}"
            
            # Store table names for this object
            self.object_tables = getattr(self, 'object_tables', {})
            self.object_tables[object_name] = {
                'data': data_table,
                'results': results_table
            }
            
            # Drop existing tables
            self.conn.execute(f"DROP TABLE IF EXISTS {data_table}")
            self.conn.execute(f"DROP TABLE IF EXISTS {results_table}")
            
            # Create data table with better schema
            create_data_sql = f"""
            CREATE TABLE {data_table} (
                org_username TEXT NOT NULL,
                record_id TEXT NOT NULL,
                foreign_key_value TEXT,
                record_data TEXT NOT NULL,
                is_active INTEGER DEFAULT 1,
                created_date TEXT,
                modified_date TEXT,
                created_by TEXT,
                PRIMARY KEY (org_username, record_id)
            ) WITHOUT ROWID
            """
            self.conn.execute(create_data_sql)
            
            # Create results table with optimized schema
            create_results_sql = f"""
            CREATE TABLE {results_table} (
                record_id TEXT NOT NULL,
                foreign_key_value TEXT,
                comparison_type TEXT NOT NULL,
                field_name TEXT,
                differences TEXT,
                org_values TEXT,
                all_org_data TEXT,
                created_at TEXT DEFAULT (datetime('now')),
                PRIMARY KEY (record_id, comparison_type, COALESCE(field_name, ''))
            ) WITHOUT ROWID
            """
            self.conn.execute(create_results_sql)
            
            # Create optimized indexes
            self.conn.execute(f"CREATE INDEX idx_{data_table}_fk ON {data_table}(foreign_key_value, is_active)")
            self.conn.execute(f"CREATE INDEX idx_{results_table}_type ON {results_table}(comparison_type)")
            
            self.conn.commit()
            logger.info(f"Created optimized tables for object: {object_name}")
            
        except Exception as e:
            logger.error(f"Error creating tables for {object_name}: {e}")
            raise

    def store_org_data_batch(self, object_name: str, org_data: Dict[str, List[Dict]]) -> None:
        """Store data using batch operations for better performance"""
        try:
            tables = self.object_tables[object_name]
            data_table = tables['data']
            object_config = self.objects[object_name]
            foreign_key = object_config['foreignKey']
            
            # Prepare batch insert
            insert_sql = f"""
            INSERT INTO {data_table} 
            (org_username, record_id, foreign_key_value, record_data, is_active, 
             created_date, modified_date, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """
            
            # Prepare all records for batch insert
            batch_data = []
            total_records = 0
            
            for org_username, records in org_data.items():
                for record in records:
                    foreign_key_value = record.get(foreign_key)
                    is_active = 1 if self._check_active_conditions(record, object_config) else 0
                    
                    batch_data.append((
                        org_username,
                        record['Id'],
                        foreign_key_value,
                        json.dumps(record, separators=(',', ':')),  # Compact JSON
                        is_active,
                        record.get('CreatedDate'),
                        record.get('LastModifiedDate'),
                        record.get('CreatedBy.Name')
                    ))
                    
                total_records += len(records)
            
            # Execute batch insert
            self.conn.executemany(insert_sql, batch_data)
            self.conn.commit()
            
            # Log summary
            active_count = self.conn.execute(
                f"SELECT COUNT(*) FROM {data_table} WHERE is_active = 1"
            ).fetchone()[0]
            
            logger.info(f"Stored {total_records} records ({active_count} active) for {object_name}")
                
        except Exception as e:
            logger.error(f"Error storing org data for {object_name}: {e}")
            raise

    def _check_active_conditions(self, record: Dict, object_config: Dict) -> bool:
        """Optimized active condition checking"""
        active_condition = object_config.get('ActiveCondition')
        if not active_condition:
            return True
            
        # Fast string-based evaluation for common patterns
        condition_lower = active_condition.lower()
        
        if 'isactive__c = true' in condition_lower:
            return str(record.get('IsActive__c', '')).lower() == 'true'
        elif 'active__c = true' in condition_lower:
            return str(record.get('Active__c', '')).lower() == 'true'
        elif '!= null' in condition_lower:
            # Extract field name before != null
            field_part = active_condition.split('!=')[0].strip()
            return record.get(field_part) is not None
        
        return True  # Default to active

    def compare_object_records_optimized(self, object_name: str) -> None:
        """Optimized comparison for large datasets"""
        try:
            tables = self.object_tables[object_name]
            data_table = tables['data']
            results_table = tables['results']
            object_config = self.objects[object_name]
            compare_fields = object_config.get('Fields', [])
            
            logger.info(f"Starting optimized comparison for {object_name}")
            
            # Get unique foreign key values using optimized query
            fk_query = f"""
            SELECT foreign_key_value, COUNT(*) as org_count
            FROM {data_table} 
            WHERE is_active = 1 AND foreign_key_value IS NOT NULL
            GROUP BY foreign_key_value
            """
            foreign_key_stats = self.conn.execute(fk_query).fetchall()
            
            total_orgs = len(self.orgs)
            missing_records = []
            comparison_batches = []
            
            logger.info(f"Processing {len(foreign_key_stats)} unique records")
            
            # Process foreign keys in batches
            for fk_value, org_count in foreign_key_stats:
                if org_count < total_orgs:
                    # This record is missing from some orgs
                    missing_records.append(fk_value)
                
                if org_count > 1:
                    # This record exists in multiple orgs, needs field comparison
                    comparison_batches.append(fk_value)
            
            # Batch process missing records
            if missing_records:
                self._process_missing_records_batch(object_name, missing_records)
            
            # Batch process field comparisons
            if comparison_batches:
                self._process_field_comparisons_batch(object_name, comparison_batches, compare_fields)
            
            self.conn.commit()
            logger.info(f"Completed comparison for {object_name}: {len(missing_records)} missing, {len(comparison_batches)} compared")
            
        except Exception as e:
            logger.error(f"Error in optimized comparison for {object_name}: {e}")
            raise

    def _process_missing_records_batch(self, object_name: str, missing_fk_values: List[str]) -> None:
        """Process missing records in batches"""
        tables = self.object_tables[object_name]
        data_table = tables['data']
        results_table = tables['results']
        
        # Get org presence for missing records
        placeholders = ','.join('?' * len(missing_fk_values))
        org_presence_query = f"""
        SELECT foreign_key_value, GROUP_CONCAT(org_username) as present_orgs
        FROM {data_table}
        WHERE foreign_key_value IN ({placeholders}) AND is_active = 1
        GROUP BY foreign_key_value
        """
        
        missing_results = []
        all_orgs = set(self.orgs.keys())
        
        for row in self.conn.execute(org_presence_query, missing_fk_values):
            fk_value, present_orgs_str = row
            present_orgs = set(present_orgs_str.split(','))
            missing_orgs = list(all_orgs - present_orgs)
            
            if missing_orgs:
                missing_results.append((
                    fk_value,  # record_id
                    fk_value,  # foreign_key_value
                    'missing',  # comparison_type
                    None,  # field_name
                    json.dumps(missing_orgs, separators=(',', ':')),  # differences
                    json.dumps({org: 'MISSING' for org in missing_orgs}, separators=(',', ':')),  # org_values
                    None  # all_org_data (too expensive for missing records)
                ))
        
        # Batch insert missing results
        if missing_results:
            insert_sql = f"""
            INSERT INTO {results_table} 
            (record_id, foreign_key_value, comparison_type, field_name, differences, org_values, all_org_data)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """
            self.conn.executemany(insert_sql, missing_results)

    def _process_field_comparisons_batch(self, object_name: str, fk_values: List[str], compare_fields: List[str]) -> None:
        """Process field comparisons in optimized batches"""
        tables = self.object_tables[object_name]
        data_table = tables['data']
        results_table = tables['results']
        
        # Process in chunks to manage memory
        chunk_size = 100
        
        for i in range(0, len(fk_values), chunk_size):
            chunk = fk_values[i:i + chunk_size]
            self._compare_fields_chunk(object_name, chunk, compare_fields)

    def _compare_fields_chunk(self, object_name: str, fk_chunk: List[str], compare_fields: List[str]) -> None:
        """Compare fields for a chunk of foreign keys"""
        tables = self.object_tables[object_name]
        data_table = tables['data']
        results_table = tables['results']
        
        # Get all record data for this chunk
        placeholders = ','.join('?' * len(fk_chunk))
        chunk_query = f"""
        SELECT foreign_key_value, org_username, record_id, record_data
        FROM {data_table}
        WHERE foreign_key_value IN ({placeholders}) AND is_active = 1
        ORDER BY foreign_key_value
        """
        
        # Group records by foreign key
        records_by_fk = defaultdict(dict)
        for row in self.conn.execute(chunk_query, fk_chunk):
            fk_value, org_username, record_id, record_data_json = row
            record_data = json.loads(record_data_json)
            records_by_fk[fk_value][org_username] = {
                'record_id': record_id,
                'data': record_data
            }
        
        # Compare fields for each foreign key
        field_differences = []
        
        for fk_value, org_records in records_by_fk.items():
            if len(org_records) < 2:
                continue  # Need at least 2 orgs to compare
                
            record_id = next(iter(org_records.values()))['record_id']
            
            for field_name in compare_fields:
                if field_name in self.system_fields:
                    continue
                
                # Get field values from all orgs
                field_values = {}
                for org_username, org_record in org_records.items():
                    field_values[org_username] = str(org_record['data'].get(field_name, ''))
                
                # Check for differences
                unique_values = set(field_values.values())
                if len(unique_values) > 1:
                    # Find minority values (different orgs)
                    value_counts = defaultdict(list)
                    for org, value in field_values.items():
                        value_counts[value].append(org)
                    
                    max_count = max(len(orgs) for orgs in value_counts.values())
                    different_orgs = []
                    
                    for value, orgs in value_counts.items():
                        if len(orgs) < max_count:
                            different_orgs.extend(orgs)
                    
                    field_differences.append((
                        record_id,
                        fk_value,
                        'different',
                        field_name,
                        json.dumps(different_orgs, separators=(',', ':')),
                        json.dumps(field_values, separators=(',', ':')),
                        None  # Skip all_org_data for performance
                    ))
        
        # Batch insert field differences
        if field_differences:
            insert_sql = f"""
            INSERT INTO {results_table} 
            (record_id, foreign_key_value, comparison_type, field_name, differences, org_values, all_org_data)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """
            self.conn.executemany(insert_sql, field_differences)

    def generate_object_summary(self, object_name: str) -> Dict[str, Any]:
        """Generate performance-optimized summary"""
        tables = self.object_tables[object_name]
        data_table = tables['data']
        results_table = tables['results']
        
        # Use single query for all stats
        summary_query = f"""
        SELECT 
            (SELECT COUNT(DISTINCT foreign_key_value) FROM {data_table} WHERE is_active = 1) as total_records,
            (SELECT COUNT(DISTINCT record_id) FROM {results_table} WHERE comparison_type = 'missing') as missing_records,
            (SELECT COUNT(*) FROM {results_table} WHERE comparison_type = 'different') as field_differences
        """
        
        row = self.conn.execute(summary_query).fetchone()
        total_records, missing_records, field_differences = row
        
        return {
            'object_name': object_name,
            'total_records': total_records,
            'missing_records': missing_records,
            'field_differences': field_differences,
            'status': 'completed'
        }

    def process_object_comparison(self, object_name: str, org_data: Dict[str, List[Dict]]) -> Dict[str, Any]:
        """Process comparison for a single object with optimizations"""
        try:
            logger.info(f"Processing comparison for object: {object_name}")
            
            # Create tables
            self.create_data_tables(object_name)
            
            # Store data using batch operations
            self.store_org_data_batch(object_name, org_data)
            
            # Perform optimized comparison
            self.compare_object_records_optimized(object_name)
            
            # Generate summary
            summary = self.generate_object_summary(object_name)
            
            logger.info(f"Completed comparison for {object_name}: {summary}")
            return summary
            
        except Exception as e:
            logger.error(f"Error processing comparison for {object_name}: {e}")
            raise

    def cleanup(self):
        """Cleanup resources"""
        try:
            if hasattr(self, 'conn'):
                self.conn.close()
        except Exception as e:
            logger.error(f"Error during cleanup: {e}")

    def __del__(self):
        """Destructor"""
        self.cleanup()


def main():
    """Main entry point"""
    try:
        if len(sys.argv) != 4:
            logger.error(f"Incorrect number of arguments: {len(sys.argv)}")
            print("Usage: python multi_org_comparison.py <comparison_id> <config_json> <org_data_json>")
            sys.exit(1)

        comparison_id = sys.argv[1]
        config_json = sys.argv[2]
        org_data_json = sys.argv[3]

        # Parse inputs
        config = json.loads(config_json)
        org_data = json.loads(org_data_json)

        logger.info(f"Starting optimized multi-org comparison: {comparison_id}")
        
        # Initialize comparison engine
        engine = MultiOrgComparisonEngine(comparison_id, config)
        
        # Process each object
        results = {}
        for object_name, object_org_data in org_data.items():
            if object_name in config.get('objects', {}):
                result = engine.process_object_comparison(object_name, object_org_data)
                results[object_name] = result
                logger.info(f"Object {object_name} completed: {result}")
        
        # Output results summary
        total_records = sum(r.get('total_records', 0) for r in results.values())
        total_differences = sum(r.get('field_differences', 0) for r in results.values())
        
        logger.info(f"Multi-org comparison completed successfully: {len(results)} objects, {total_records} total records, {total_differences} differences found")
        
        # Cleanup
        engine.cleanup()
        
        sys.exit(0)
        
    except Exception as e:
        logger.error(f"Error in main: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()