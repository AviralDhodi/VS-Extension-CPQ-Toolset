#!/usr/bin/env python3
"""
Optimized Salesforce Multi-Instance Data Comparison Tool
High-performance set-based architecture with complete backward compatibility
Maintains exact same interface as original multi_org_comparison.py
"""

import os
import sys
import json
import argparse
import logging
import gc
import pandas as pd
import numpy as np
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Set, Any
from itertools import combinations
import time

class OptimizedSalesforceDataComparator:
    """
    High-performance org comparison using set-based operations
    Drop-in replacement maintaining all existing functionality and interfaces
    """
    
    def __init__(self, chunk_size: int = 50000, exclude_fields: List[str] = None):
        self.chunk_size = chunk_size
        self.logger = self._setup_logging()
        self.discovered_orgs = []
        self.common_objects = []
        self.foreign_key_mappings = {}
        self.org_display_names = {}
        self.final_differences_df = []
        self.blacklisted_fks = set()  # Set to store blacklisted foreign keys
        
        # Default exclusion list for common Salesforce system fields
        default_exclusions = [
            'CreatedDate', 'CreatedBy', 'CreatedById', 'CreatedBy_Name',
            'LastModifiedDate', 'LastModifiedBy', 'LastModifiedById', 'LastModifiedBy_Name',
            'SystemModstamp', 'Id'
        ]
        
        # Combine default exclusions with user-provided exclusions
        self.exclude_fields = set(default_exclusions)
        if exclude_fields:
            self.exclude_fields.update(exclude_fields)
            self.logger.info(f"Added custom exclusions: {exclude_fields}")
        
        self.logger.info(f"Excluding fields from comparison: {sorted(list(self.exclude_fields))}")
        
    def _setup_logging(self) -> logging.Logger:
        """Set up logging configuration."""
        logger = logging.getLogger(__name__)
        logger.setLevel(logging.INFO)
        
        if not logger.handlers:
            handler = logging.StreamHandler()
            formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
            handler.setFormatter(formatter)
            logger.addHandler(handler)
        
        return logger
    
    def discover_orgs_and_objects(self, base_path: str) -> Dict:
        """Discover all organizations and common objects in the base directory."""
        self.logger.info(f"Starting discovery in {base_path}")
        
        # Load configuration
        config_loaded = self._load_foreign_key_config(base_path)
        
        # Load blacklisted foreign keys
        self._load_blacklisted_fks(base_path)
        
        # Discover organization folders (exclude known non-org directories)
        exclude_dirs = {'.buffers', 'comparison_results', 'results', 'output', 'temp', 'tmp'}
        org_folders = [d for d in os.listdir(base_path) 
                      if os.path.isdir(os.path.join(base_path, d)) 
                      and not d.startswith('.') 
                      and d not in exclude_dirs]
        
        # Map folder names to display names
        for folder in org_folders:
            display_name = self.org_display_names.get(folder, folder)
            self.logger.info(f"Mapped folder '{folder}' to org '{display_name}'")
        
        # Find common objects across all orgs
        all_org_objects = {}
        for org in org_folders:
            org_path = os.path.join(base_path, org)
            # Look for .parquet, .csv, or .jsonl files
            objects = []
            for f in os.listdir(org_path):
                if f.endswith('.parquet'):
                    objects.append(f.replace('.parquet', ''))
                elif f.endswith('.csv'):
                    objects.append(f.replace('.csv', ''))
                elif f.endswith('.jsonl'):
                    objects.append(f.replace('.jsonl', ''))
            all_org_objects[org] = set(objects)
        
        if all_org_objects:
            common_objects = set.intersection(*all_org_objects.values())
            self.common_objects = sorted(list(common_objects))
            self.discovered_orgs = sorted(org_folders)
        
        self.logger.info(f"Discovery complete: {len(self.discovered_orgs)} orgs, {len(self.common_objects)} common objects")
        
        return {
            'config_loaded': config_loaded,
            'total_orgs': len(self.discovered_orgs),
            'total_common_objects': len(self.common_objects),
            'discovered_orgs': self.discovered_orgs,
            'common_objects': self.common_objects
        }
    
    def _load_foreign_key_config(self, base_path: str) -> bool:
        """Load foreign key mappings from configuration file."""
        config_files = [f for f in os.listdir(base_path) if f.startswith('config_') and f.endswith('.json')]
        
        if not config_files:
            self.logger.warning("No config file found")
            return False
        
        config_file = os.path.join(base_path, config_files[0])
        self.logger.info(f"Loaded config from: {config_files[0]}")
        
        try:
            with open(config_file, 'r') as f:
                config = json.load(f)
            
            # Extract foreign key mappings from objects dictionary
            objects_config = config.get('objects', {})
            for obj_name, obj_config in objects_config.items():
                if isinstance(obj_config, dict) and 'foreignKey' in obj_config:
                    foreign_key = obj_config['foreignKey']
                    self.foreign_key_mappings[obj_name] = foreign_key
                    self.logger.info(f"Found foreign key for {obj_name}: {foreign_key}")
            
            # Extract org display names from orgs array
            orgs_config = config.get('orgs', [])
            for org_config in orgs_config:
                if isinstance(org_config, dict):
                    username = org_config.get('username', '')
                    alias = org_config.get('alias', username)
                    # Convert username to folder name format
                    folder_name = username.replace('@', '_').replace('.', '_')
                    if folder_name:
                        self.org_display_names[folder_name] = alias
            
            self.logger.info(f"Extracted {len(self.foreign_key_mappings)} foreign key mappings from config")
            return True
            
        except Exception as e:
            self.logger.error(f"Error loading config: {e}")
            return False
    
    def _load_blacklisted_fks(self, base_path: str):
        """Load blacklisted foreign keys from duplicate resolution."""
        blacklist_file = os.path.join(base_path, 'blacklisted_foreign_keys.json')
        
        if not os.path.exists(blacklist_file):
            self.logger.info("No blacklist file found - proceeding without FK blacklisting")
            return
        
        try:
            with open(blacklist_file, 'r') as f:
                blacklist_data = json.load(f)
            
            blacklisted_fks = blacklist_data.get('blacklisted_fks', [])
            self.blacklisted_fks = set(blacklisted_fks)
            
            self.logger.info(f"Loaded {len(self.blacklisted_fks)} blacklisted foreign keys from {blacklist_file}")
            if self.blacklisted_fks:
                self.logger.info(f"Blacklisted FKs: {sorted(list(self.blacklisted_fks))}")
            
        except Exception as e:
            self.logger.error(f"Error loading blacklist file: {e}")
            # Don't fail the entire process - continue without blacklisting
    
    def _filter_blacklisted_fks(self, df: pd.DataFrame, object_name: str) -> pd.DataFrame:
        """Filter out records with blacklisted foreign keys."""
        if not self.blacklisted_fks or 'primary_key' not in df.columns:
            return df
        
        # Create the blacklist key format: object_name:fk_value
        def is_blacklisted(row):
            if pd.isna(row['primary_key']) or row['primary_key'] is None:
                return False
            blacklist_key = f"{object_name}:{row['primary_key']}"
            return blacklist_key in self.blacklisted_fks
        
        # Filter out blacklisted records
        mask = ~df.apply(is_blacklisted, axis=1)
        return df[mask]
    
    def _load_sf_object_data(self, base_path: str, org: str, sf_object: str, key_field: str) -> Optional[pd.DataFrame]:
        """Load Salesforce object data from parquet, CSV, or JSONL file with optimized caching."""
        # Try parquet first (fastest), then JSONL with parquet caching, then CSV
        parquet_file = os.path.join(base_path, org, f"{sf_object}.parquet")
        jsonl_file = os.path.join(base_path, org, f"{sf_object}.jsonl")
        csv_file = os.path.join(base_path, org, f"{sf_object}.csv")
        
        try:
            # Method 1: Direct parquet load (fastest)
            if os.path.exists(parquet_file):
                self.logger.debug(f"Loading parquet: {parquet_file}")
                return pd.read_parquet(parquet_file)
            
            # Method 2: JSONL with parquet caching (optimized)
            elif os.path.exists(jsonl_file):
                parquet_cache_path = jsonl_file.replace('.jsonl', '.parquet')
                
                if os.path.exists(parquet_cache_path):
                    # Use cached parquet file if available
                    self.logger.debug(f"Using cached parquet file: {parquet_cache_path}")
                    return pd.read_parquet(parquet_cache_path)
                else:
                    # Load JSONL and convert to DataFrame with caching
                    self.logger.debug(f"Loading and caching JSONL: {jsonl_file}")
                    records = []
                    with open(jsonl_file, 'r') as f:
                        for line in f:
                            if line.strip():
                                try:
                                    record = json.loads(line)
                                    records.append(record)
                                except json.JSONDecodeError:
                                    continue
                    
                    if not records:
                        self.logger.warning(f"No valid records found in {jsonl_file}")
                        return None
                    
                    # Convert to pandas DataFrame
                    df = pd.DataFrame(records)
                    
                    # Save as parquet for future use
                    try:
                        df.to_parquet(parquet_cache_path, index=False)
                        self.logger.info(f"Created parquet cache: {parquet_cache_path}")
                    except Exception as e:
                        self.logger.warning(f"Could not create parquet cache: {e}")
                    
                    return df
            
            # Method 3: CSV fallback (slowest)
            elif os.path.exists(csv_file):
                self.logger.debug(f"Loading CSV: {csv_file}")
                return pd.read_csv(csv_file, dtype=str, low_memory=False)
            
            else:
                return None
                
        except Exception as e:
            self.logger.error(f"Error loading {sf_object} for {org}: {e}")
            return None
    
    def create_mega_dataframe(self, org_list: List[str], base_path: str) -> pd.DataFrame:
        """
        Phase 1: Combine all objects into single mega DataFrame
        Adds metadata columns for set-based operations
        """
        self.logger.info("Creating mega DataFrame for set-based comparison")
        all_dataframes = []
        
        # Filter to objects with foreign keys only
        objects_with_keys = [obj for obj in self.common_objects 
                           if obj in self.foreign_key_mappings]
        
        if not objects_with_keys:
            raise ValueError("No objects with foreign keys found")
        
        self.logger.info(f"Processing {len(objects_with_keys)} objects with foreign keys")
        
        for object_name in objects_with_keys:
            primary_key = self.foreign_key_mappings[object_name]
            
            for org in org_list:
                df = self._load_sf_object_data(base_path, org, object_name, primary_key)
                
                if df is not None and not df.empty:
                    # Exclude system fields
                    df_filtered = df.drop(columns=[col for col in df.columns 
                                                 if col in self.exclude_fields], 
                                        errors='ignore')
                    
                    # Add metadata columns
                    df_filtered['object_name'] = object_name
                    df_filtered['org_name'] = org
                    df_filtered['primary_key'] = df_filtered[primary_key] if primary_key in df_filtered.columns else None
                    
                    # Filter out blacklisted foreign keys
                    if self.blacklisted_fks:
                        original_count = len(df_filtered)
                        df_filtered = self._filter_blacklisted_fks(df_filtered, object_name)
                        filtered_count = len(df_filtered)
                        
                        if original_count != filtered_count:
                            self.logger.info(f"Filtered {original_count - filtered_count} records with blacklisted FKs for {object_name}/{org}")
                    
                    # Create composite key for set operations
                    df_filtered['composite_key'] = df_filtered.apply(
                        lambda row: self._create_composite_key(row, primary_key), axis=1
                    )
                    
                    all_dataframes.append(df_filtered)
                    self.logger.debug(f"Added {len(df_filtered)} records for {object_name}/{org}")
        
        if not all_dataframes:
            raise ValueError(f"No data found for orgs: {org_list}")
        
        mega_df = pd.concat(all_dataframes, ignore_index=True)
        self.logger.info(f"Created mega DataFrame: {len(mega_df)} total records across {len(objects_with_keys)} objects")
        return mega_df
    
    def _create_composite_key(self, row: pd.Series, primary_key: str) -> Tuple:
        """Create hashable tuple for set operations"""
        # Include all data except metadata for complete record comparison
        exclude_cols = {'org_name', 'composite_key', 'object_name', 'primary_key'}
        data_cols = [col for col in row.index if col not in exclude_cols]
        
        # Create tuple with object and primary key for uniqueness
        key_data = [row.get('object_name', ''), row.get('primary_key', '')]
        key_data.extend([row[col] for col in data_cols])
        return tuple(key_data)
    
    def run_set_comparisons(self, mega_df: pd.DataFrame, org_list: List[str], base_path: str):
        """
        Phase 2: Run optimized set-based comparisons
        Uses pandas groupby and set operations for maximum performance
        """
        self.logger.info(f"Running set-based comparisons for {len(org_list)} orgs")
        
        # Split mega DataFrame by org for faster lookups
        org_datasets = {}
        for org in org_list:
            org_data = mega_df[mega_df['org_name'] == org].copy()
            org_datasets[org] = org_data
            self.logger.debug(f"Org {org}: {len(org_data)} records")
        
        # Generate all org pairs for comparison
        comparison_count = 0
        total_comparisons = len(org_list) * (len(org_list) - 1)
        
        for ref_org in org_list:
            for comp_org in org_list:
                if ref_org != comp_org:
                    comparison_count += 1
                    self.logger.info(f"Comparison {comparison_count}/{total_comparisons}: {ref_org} vs {comp_org}")
                    
                    # Get sets for comparison
                    ref_set = set(org_datasets[ref_org]['composite_key'])
                    comp_set = set(org_datasets[comp_org]['composite_key'])
                    
                    # Find differences using set operations (very fast)
                    differences = ref_set - comp_set
                    
                    if differences:
                        self.logger.debug(f"Found {len(differences)} differences")
                        self._process_differences(
                            differences, ref_org, comp_org, 
                            org_datasets, mega_df
                        )
                    
                    # Check for value differences in common records
                    common_keys = ref_set & comp_set
                    if common_keys:
                        self._check_value_differences(
                            common_keys, ref_org, comp_org, org_datasets
                        )
        
        self.logger.info(f"Completed {comparison_count} set comparisons")
    
    def _process_differences(self, differences: Set[Tuple], reference_org: str, 
                           compared_org: str, org_datasets: Dict, mega_df: pd.DataFrame):
        """Process differences found by set operations"""
        ref_records = org_datasets[reference_org]
        comp_records = org_datasets[compared_org]
        
        for diff_tuple in differences:
            # Find the record in reference org
            matching_ref = ref_records[ref_records['composite_key'] == diff_tuple]
            
            if matching_ref.empty:
                continue
                
            ref_record = matching_ref.iloc[0]
            primary_key_value = ref_record['primary_key']
            object_name = ref_record['object_name']
            
            # Check if record exists in compared org
            matching_comp = comp_records[
                (comp_records['primary_key'] == primary_key_value) & 
                (comp_records['object_name'] == object_name)
            ]
            
            if matching_comp.empty:
                # Record missing in compared org
                self._record_missing_difference(
                    ref_record, reference_org, compared_org, object_name
                )
            else:
                # Record exists but values differ
                comp_record = matching_comp.iloc[0]
                self._find_and_record_field_differences(
                    ref_record, comp_record, reference_org, compared_org, object_name
                )
    
    def _check_value_differences(self, common_keys: Set[Tuple], ref_org: str,
                               comp_org: str, org_datasets: Dict):
        """Check for value differences in records that exist in both orgs"""
        ref_records = org_datasets[ref_org]
        comp_records = org_datasets[comp_org]
        
        for key_tuple in common_keys:
            ref_match = ref_records[ref_records['composite_key'] == key_tuple]
            comp_match = comp_records[comp_records['composite_key'] == key_tuple]
            
            if not ref_match.empty and not comp_match.empty:
                ref_record = ref_match.iloc[0]
                comp_record = comp_match.iloc[0]
                
                # This should rarely happen with proper composite keys
                # but let's handle it gracefully
                if not self._records_identical(ref_record, comp_record):
                    object_name = ref_record['object_name']
                    self._find_and_record_field_differences(
                        ref_record, comp_record, ref_org, comp_org, object_name
                    )
    
    def _records_identical(self, record1: pd.Series, record2: pd.Series) -> bool:
        """Check if two records are identical (excluding metadata)"""
        exclude_cols = {'org_name', 'composite_key', 'object_name', 'primary_key'}
        
        for col in record1.index:
            if col not in exclude_cols:
                if pd.isna(record1[col]) and pd.isna(record2[col]):
                    continue
                if record1[col] != record2[col]:
                    return False
        return True
    
    def _find_and_record_field_differences(self, ref_record: pd.Series, 
                                         comp_record: pd.Series, ref_org: str,
                                         comp_org: str, object_name: str):
        """Find exact field differences between two records"""
        exclude_cols = {'org_name', 'composite_key', 'object_name', 'primary_key'}
        primary_key_value = ref_record['primary_key']
        
        for field_name in ref_record.index:
            if field_name not in exclude_cols:
                ref_val = ref_record[field_name]
                comp_val = comp_record[field_name]
                
                if pd.isna(ref_val) and pd.isna(comp_val):
                    continue
                    
                if ref_val != comp_val:
                    self._record_field_difference(
                        primary_key_value, object_name, field_name,
                        ref_org, ref_val, comp_org, comp_val
                    )
    
    def _record_missing_difference(self, ref_record: pd.Series, ref_org: str,
                                 comp_org: str, object_name: str):
        """Record when entire record is missing in compared org"""
        primary_key_value = ref_record['primary_key']
        exclude_cols = {'org_name', 'composite_key', 'object_name', 'primary_key'}
        
        # Record difference for each field in the missing record
        for field_name in ref_record.index:
            if field_name not in exclude_cols:
                ref_val = ref_record[field_name]
                self._record_field_difference(
                    primary_key_value, object_name, field_name,
                    ref_org, ref_val, comp_org, 'MISSING'
                )
    
    def _record_field_difference(self, primary_key_value: Any, object_name: str,
                               field_name: str, org1: str, val1: Any,
                               org2: str, val2: Any):
        """Record a single field difference in the final differences list"""
        # Determine difference type
        if val1 == 'MISSING' or val2 == 'MISSING':
            diff_type = 'RECORD_MISSING'
        else:
            diff_type = 'VALUE_DIFFERENCE'
        
        # Create difference record - exact same format as original
        diff_record = {
            'ForeignKeyField': self._get_foreign_key_field(object_name),
            'ForeignKeyValue': primary_key_value,
            'ObjectFieldName': f"{object_name}.{field_name}",
            'DifferenceType': diff_type,
            f'Org_{org1}': val1,
            f'Org_{org2}': val2
        }
        
        self.final_differences_df.append(diff_record)
    
    def _get_foreign_key_field(self, object_name: str) -> str:
        """Get foreign key field for object from config"""
        return self.foreign_key_mappings.get(object_name, 'Id')
    
    def run_full_comparison(self, base_path: str, output_dir: str) -> Dict:
        """
        Main comparison method - maintains exact same interface as original
        Optimized with set-based operations for massive performance improvement
        """
        self.logger.info("Starting optimized ALL-vs-ALL comparison")
        start_time = time.time()
        
        try:
            # Discovery phase
            discovery_result = self.discover_orgs_and_objects(base_path)
            
            if len(self.discovered_orgs) < 2:
                raise ValueError("Need at least 2 organizations for comparison")
            
            objects_with_keys = [obj for obj in self.common_objects 
                               if obj in self.foreign_key_mappings]
            
            if not objects_with_keys:
                self.logger.warning("Skipping objects without foreign keys: " + str(self.common_objects))
                raise ValueError("No objects with foreign keys found")
            
            self.logger.info(f"Processing {len(objects_with_keys)} objects with foreign keys: {objects_with_keys}")
            
            # Create mega DataFrame for set operations
            mega_df = self.create_mega_dataframe(self.discovered_orgs, base_path)
            
            # Run optimized set-based comparisons
            self.run_set_comparisons(mega_df, self.discovered_orgs, base_path)
            
            # Consolidate and output results
            summary = self._generate_output_files(output_dir)
            
            end_time = time.time()
            execution_time = end_time - start_time
            
            self.logger.info(f"Optimized comparison completed in {execution_time:.2f} seconds")
            
            return {
                'success': True,
                'execution_time': execution_time,
                'total_orgs': len(self.discovered_orgs),
                'total_objects': len(objects_with_keys),
                'total_differences': len(self.final_differences_df),
                'output_files': summary.get('output_files', []),
                'performance_improvement': f"Set-based operations used for {len(self.discovered_orgs)}x{len(self.discovered_orgs)} comparisons"
            }
            
        except Exception as e:
            self.logger.error(f"Comparison failed: {e}")
            raise
    
    def _generate_output_files(self, output_dir: str) -> Dict:
        """Generate output files in the same format as original"""
        os.makedirs(output_dir, exist_ok=True)
        
        if not self.final_differences_df:
            self.logger.info("No differences found")
            summary = {
                'timestamp': datetime.now().isoformat(),
                'total_differences': 0,
                'organizations': self.discovered_orgs,
                'objects_processed': self.common_objects,
                'output_files': []
            }
        else:
            # Convert to DataFrame and save
            differences_df = pd.DataFrame(self.final_differences_df)
            
            # Main differences file
            main_output = os.path.join(output_dir, 'all_differences.csv')
            differences_df.to_csv(main_output, index=False)
            
            # Summary file
            summary_output = os.path.join(output_dir, 'comparison_summary.json')
            summary = {
                'timestamp': datetime.now().isoformat(),
                'total_differences': len(differences_df),
                'organizations': self.discovered_orgs,
                'objects_processed': [obj for obj in self.common_objects 
                                    if obj in self.foreign_key_mappings],
                'output_files': [main_output, summary_output],
                'performance_mode': 'optimized_set_based'
            }
            
            with open(summary_output, 'w') as f:
                json.dump(summary, f, indent=2)
            
            self.logger.info(f"Results written to {main_output}")
            self.logger.info(f"Summary written to {summary_output}")
        
        return summary


def main():
    """
    Command-line interface - maintains exact same parameters as original
    """
    parser = argparse.ArgumentParser(description='Optimized Salesforce Multi-Org Data Comparison')
    parser.add_argument('base_path', help='Base directory containing org data folders')
    parser.add_argument('--output-dir', help='Output directory for results')
    parser.add_argument('--chunk-size', type=int, default=50000, help='Chunk size for processing')
    parser.add_argument('--exclude-fields', nargs='*', help='Additional fields to exclude')
    
    args = parser.parse_args()
    
    # Set up paths
    base_path = os.path.abspath(args.base_path)
    output_dir = args.output_dir or os.path.join(base_path, 'comparison_results')
    
    if not os.path.exists(base_path):
        print(f"Error: Base path does not exist: {base_path}")
        sys.exit(1)
    
    try:
        # Initialize comparator with optimizations
        comparator = OptimizedSalesforceDataComparator(
            chunk_size=args.chunk_size,
            exclude_fields=args.exclude_fields
        )
        
        # Run comparison
        result = comparator.run_full_comparison(base_path, output_dir)
        
        print(f"✅ Optimized comparison completed successfully!")
        print(f"⚡ Performance: {result['performance_improvement']}")
        print(f"📊 Found {result['total_differences']} differences")
        print(f"⏱️ Execution time: {result['execution_time']:.2f} seconds")
        print(f"📁 Results saved to: {output_dir}")
        
    except Exception as e:
        print(f"❌ Comparison failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()