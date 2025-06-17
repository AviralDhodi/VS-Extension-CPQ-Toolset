#!/usr/bin/env python3
"""
Salesforce Multi-Instance Data Comparison Tool
Performs comprehensive ALL-vs-ALL comparisons across multiple Salesforce organizations
with detailed field-by-field difference reporting.
"""

import os
import sys
import json
import argparse
import logging
import gc
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import pandas as pd
import numpy as np
import dask.dataframe as dd

class SalesforceDataComparator:
    """Compare Salesforce data across multiple organizations with detailed field-level analysis."""
    
    def __init__(self, chunk_size: int = 50000, exclude_fields: List[str] = None):
        self.chunk_size = chunk_size
        self.logger = self._setup_logging()
        self.discovered_orgs = []
        self.common_objects = []
        self.foreign_key_mappings = {}
        self.org_display_names = {}
        
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
        
        # Discover organization folders
        org_folders = [d for d in os.listdir(base_path) 
                      if os.path.isdir(os.path.join(base_path, d)) 
                      and not d.startswith('.')]
        
        # Map folder names to display names
        for folder in org_folders:
            display_name = self.org_display_names.get(folder, folder)
            self.logger.info(f"Mapped folder '{folder}' to org '{display_name}'")
        
        # Find common objects across all orgs
        all_org_objects = {}
        for org in org_folders:
            org_path = os.path.join(base_path, org)
            # Look for both .parquet and .csv files
            objects = []
            for f in os.listdir(org_path):
                if f.endswith('.parquet'):
                    objects.append(f.replace('.parquet', ''))
                elif f.endswith('.csv'):
                    objects.append(f.replace('.csv', ''))
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
    
    def _load_sf_object_data(self, base_path: str, org: str, sf_object: str, key_field: str) -> Optional[dd.DataFrame]:
        """Load Salesforce object data from parquet or CSV file."""
        # Try parquet first, then CSV
        parquet_file = os.path.join(base_path, org, f"{sf_object}.parquet")
        csv_file = os.path.join(base_path, org, f"{sf_object}.csv")
        
        file_path = None
        file_type = None
        
        if os.path.exists(parquet_file):
            file_path = parquet_file
            file_type = 'parquet'
        elif os.path.exists(csv_file):
            file_path = csv_file
            file_type = 'csv'
        else:
            return None
        
        try:
            # Load with dask for memory efficiency
            if file_type == 'parquet':
                df = dd.read_parquet(file_path)
            else:
                df = dd.read_csv(file_path, dtype=str, low_memory=False)
            
            # Remove excluded fields
            existing_excluded_fields = [field for field in self.exclude_fields if field in df.columns]
            if existing_excluded_fields:
                df = df.drop(columns=existing_excluded_fields)
                self.logger.info(f"Removed excluded fields from {sf_object}: {existing_excluded_fields}")
            
            # Ensure key field exists and is not excluded
            if key_field not in df.columns:
                if key_field in self.exclude_fields:
                    self.logger.error(f"Key field '{key_field}' is in exclusion list but needed for comparison in {sf_object}")
                else:
                    self.logger.error(f"Key field '{key_field}' not found in {sf_object} for {org}")
                return None
            
            return df
            
        except Exception as e:
            self.logger.error(f"Error loading {sf_object} from {org}: {e}")
            return None
    
    def compare_single_object_all_instances(self, base_path: str, sf_object: str, 
                                          custom_key_field: str = None) -> Dict:
        """Compare a single Salesforce object across ALL organizations using all-vs-all strategy."""
        self.logger.info(f"Starting comparison for {sf_object} across all organizations")
        
        # Ensure discovery is complete
        if not self.discovered_orgs:
            self.discover_orgs_and_objects(base_path)
        
        # Get foreign key field
        key_field = custom_key_field or self.foreign_key_mappings.get(sf_object)
        if not key_field:
            return {
                "object": sf_object,
                "status": "skipped",
                "reason": f"No foreign key defined for {sf_object}",
                "available_objects_with_keys": list(self.foreign_key_mappings.keys())
            }
        
        self.logger.info(f"Using {'custom' if custom_key_field else 'config-defined'} foreign key for {sf_object}: {key_field}")
        
        # Load data from all instances
        org_data = {}
        for org in self.discovered_orgs:
            try:
                df = self._load_sf_object_data(base_path, org, sf_object, key_field)
                if df is not None and len(df) > 0:
                    org_data[org] = df
                    self.logger.info(f"Loaded {sf_object} from {org}: {len(df)} records")
                else:
                    self.logger.warning(f"No data found for {sf_object} in {org}")
            except Exception as e:
                self.logger.error(f"Error loading {sf_object} from {org}: {e}")
        
        if len(org_data) < 2:
            return {
                "object": sf_object,
                "status": "skipped", 
                "reason": f"Insufficient instances with data (found {len(org_data)}, need >=2)",
                "available_orgs": list(org_data.keys())
            }
        
        # Perform ALL-vs-ALL comparisons
        comparison_results = self._perform_all_vs_all_comparisons(org_data, key_field, sf_object)
        
        # Create detailed field-by-field comparison across all orgs
        detailed_comparison = self._create_detailed_comparison(org_data, key_field, sf_object)
        
        # Generate object summary
        object_summary = self._generate_object_summary(comparison_results, detailed_comparison)
        
        return {
            'object': sf_object,
            'status': 'completed',
            'key_field': key_field,
            'total_orgs': len(org_data),
            'total_comparisons': len(comparison_results),
            'available_orgs': list(org_data.keys()),
            'comparisons': comparison_results,
            'detailed_comparison': detailed_comparison,
            'summary': object_summary
        }
    
    def _perform_all_vs_all_comparisons(self, org_data: Dict, key_field: str, sf_object: str) -> Dict:
        """Perform all-vs-all pairwise comparisons between organizations."""
        comparison_results = {}
        org_list = list(org_data.keys())
        
        total_comparisons = len(org_list) * (len(org_list) - 1) // 2  # n*(n-1)/2
        self.logger.info(f"Starting {total_comparisons} ALL-vs-ALL comparisons for {sf_object}")
        
        comparison_count = 0
        for i, org1 in enumerate(org_list):
            for j, org2 in enumerate(org_list[i+1:], i+1):
                comparison_count += 1
                self.logger.info(f"Comparison {comparison_count}/{total_comparisons}: {org1} vs {org2}")
                
                comparison = self._compare_two_instances(
                    org_data[org1], org_data[org2], key_field, org1, org2, sf_object
                )
                comparison_results[f"{org1}_vs_{org2}"] = comparison
                
                # Log results
                field_diffs = comparison.get('field_differences', {})
                if field_diffs:
                    self.logger.info(f"COMPLETED: {org1} vs {org2} - {len(field_diffs)} fields with differences")
                else:
                    self.logger.info(f"COMPLETED: {org1} vs {org2} - No differences found")
        
        self.logger.info(f"All {total_comparisons} comparisons completed for {sf_object}")
        return comparison_results
    
    def _compare_two_instances(self, ref_data: dd.DataFrame, comp_data: dd.DataFrame,
                              key_field: str, ref_instance: str, comp_instance: str, sf_object: str) -> Dict:
        """Compare two Salesforce instances for a specific object."""
        try:
            # Convert to pandas for easier indexing
            ref_df = ref_data.compute().set_index(key_field)
            comp_df = comp_data.compute().set_index(key_field)
            
            # Find record differences
            ref_keys = set(ref_df.index)
            comp_keys = set(comp_df.index)
            
            common_keys = ref_keys.intersection(comp_keys)
            ref_only = ref_keys - comp_keys
            comp_only = comp_keys - ref_keys
            
            self.logger.info(f"Record counts - Common: {len(common_keys)}, "
                           f"{ref_instance} only: {len(ref_only)}, "
                           f"{comp_instance} only: {len(comp_only)}")
            
            # Compare common records
            field_differences = {}
            if len(common_keys) > 0:
                field_differences = self._compare_common_records(ref_df, comp_df, list(common_keys))
            
            return {
                "record_counts": {
                    "common": len(common_keys),
                    f"{ref_instance}_only": len(ref_only),
                    f"{comp_instance}_only": len(comp_only),
                    "ref_only_sample": list(ref_only)[:10],
                    "comp_only_sample": list(comp_only)[:10]
                },
                "field_differences": field_differences
            }
            
        except Exception as e:
            self.logger.error(f"Error comparing instances: {e}")
            return {"error": str(e)}
    
    def _compare_common_records(self, ref_df: pd.DataFrame, comp_df: pd.DataFrame, common_keys: List) -> Dict:
        """Compare field values for records that exist in both instances."""
        field_differences = {}
        common_columns = list(set(ref_df.columns) & set(comp_df.columns))
        
        for column in common_columns:
            try:
                # Get values for common records
                ref_values = ref_df.loc[common_keys, column]
                comp_values = comp_df.loc[common_keys, column]
                
                # Type-specific comparison
                if ref_values.dtype in ['float64', 'float32', 'int64', 'int32']:
                    diff_mask = ~np.isclose(ref_values, comp_values, rtol=1e-09, atol=1e-09, equal_nan=True)
                elif 'datetime' in str(ref_values.dtype):
                    diff_mask = ref_values != comp_values
                else:
                    diff_mask = ref_values.astype(str) != comp_values.astype(str)
                
                if diff_mask.any():
                    diff_keys = [common_keys[i] for i, is_diff in enumerate(diff_mask) if is_diff]
                    field_differences[column] = {
                        'difference_count': len(diff_keys),
                        'difference_percentage': (len(diff_keys) / len(common_keys)) * 100,
                        'sample_differences': self._get_sample_differences(ref_values, comp_values, diff_keys[:10])
                    }
                    
                    self.logger.info(f"FIELD DIFFERENCE: {column} - {len(diff_keys)} records differ "
                                   f"({(len(diff_keys)/len(common_keys)*100):.1f}%)")
                    
            except Exception as e:
                self.logger.warning(f"Error comparing column {column}: {str(e)}")
                continue
        
        return field_differences
    
    def _get_sample_differences(self, ref_values: pd.Series, comp_values: pd.Series, diff_keys: List) -> List[Dict]:
        """Get sample of differences for reporting."""
        samples = []
        for key in diff_keys:
            try:
                samples.append({
                    'key': str(key),
                    'reference_value': str(ref_values.loc[key]) if key in ref_values.index else 'N/A',
                    'comparison_value': str(comp_values.loc[key]) if key in comp_values.index else 'N/A'
                })
            except Exception:
                continue
        return samples
    
    def _create_detailed_comparison(self, org_data: Dict, key_field: str, sf_object: str) -> Dict:
        """Create detailed field-by-field comparison across all organizations."""
        self.logger.info(f"Creating detailed comparison for {sf_object}")
        
        # Convert all DataFrames to pandas and set index
        org_dataframes = {}
        for org, data in org_data.items():
            df = data.compute() if hasattr(data, 'compute') else data
            df = df.set_index(key_field)
            org_dataframes[org] = df
        
        # Get all unique records and fields across all orgs
        all_keys = set()
        all_fields = set()
        for df in org_dataframes.values():
            all_keys.update(df.index.tolist())
            all_fields.update(df.columns.tolist())
        
        all_keys = sorted(list(all_keys))
        all_fields = sorted(list(all_fields))
        org_list = sorted(list(org_dataframes.keys()))
        
        # Create detailed comparison rows
        comparison_rows = []
        field_summary = {}
        
        for field in all_fields:
            field_differences = 0
            
            for key in all_keys:
                # Get values for this field across all orgs
                values = {}
                for org in org_list:
                    df = org_dataframes[org]
                    if key in df.index and field in df.columns:
                        value = df.loc[key, field]
                        if pd.isna(value):
                            values[org] = "NULL"
                        else:
                            values[org] = str(value)
                    else:
                        values[org] = "MISSING"
                
                # Check if there are differences
                unique_values = set(values.values())
                if len(unique_values) > 1:  # There are differences
                    field_differences += 1
                    
                    # Create row for this difference
                    row = {
                        'ForeignKeyField': key_field,
                        'ForeignKeyValue': str(key),
                        'ObjectFieldName': f"{sf_object}.{field}",
                        'DifferenceType': self._categorize_difference(values)
                    }
                    
                    # Add values for each org
                    for org in org_list:
                        row[f"Org_{org}"] = values.get(org, "MISSING")
                    
                    comparison_rows.append(row)
            
            # Track field-level summary
            if field_differences > 0:
                field_summary[field] = {
                    'total_records_with_differences': field_differences,
                    'total_records': len(all_keys),
                    'difference_percentage': (field_differences / len(all_keys)) * 100
                }
        
        return {
            'sf_object': sf_object,
            'key_field': key_field,
            'total_orgs': len(org_list),
            'org_list': org_list,
            'total_records': len(all_keys),
            'total_fields': len(all_fields),
            'fields_with_differences': len(field_summary),
            'total_difference_rows': len(comparison_rows),
            'field_summary': field_summary,
            'detailed_rows': comparison_rows
        }
    
    def _categorize_difference(self, values: Dict) -> str:
        """Categorize the type of difference found."""
        unique_values = set(values.values())
        
        if "MISSING" in unique_values:
            if len(unique_values) == 2 and "MISSING" in unique_values:
                return "RECORD_MISSING"
            else:
                return "MIXED_MISSING_VALUE"
        elif "NULL" in unique_values:
            return "NULL_VALUE_DIFFERENCE"
        else:
            return "VALUE_DIFFERENCE"
    
    def _generate_object_summary(self, comparison_results: Dict, detailed_comparison: Dict) -> Dict:
        """Generate summary for object comparison across all instances."""
        if not comparison_results:
            return {"error": "No comparison results"}
        
        total_comparisons = len(comparison_results)
        comparisons_with_diffs = sum(1 for comp_data in comparison_results.values() 
                                   if comp_data.get('field_differences'))
        
        total_field_differences = sum(len(comp_data.get('field_differences', {})) 
                                    for comp_data in comparison_results.values())
        
        return {
            'object_name': detailed_comparison.get('sf_object', 'unknown'),
            'total_comparisons': total_comparisons,
            'comparisons_with_differences': comparisons_with_diffs,
            'total_field_differences': total_field_differences,
            'consistency_score': ((total_comparisons - comparisons_with_diffs) / total_comparisons) * 100,
            'detailed_summary': {
                'total_records': detailed_comparison.get('total_records', 0),
                'total_fields': detailed_comparison.get('total_fields', 0),
                'fields_with_differences': detailed_comparison.get('fields_with_differences', 0),
                'total_difference_rows': detailed_comparison.get('total_difference_rows', 0)
            },
            'timestamp': datetime.now().isoformat()
        }
    
    def compare_all_objects(self, base_path: str, sf_objects: List[str] = None, 
                          exclude_fields: List[str] = None) -> Dict:
        """Compare all specified or discovered Salesforce objects across all organizations."""
        start_time = datetime.now()
        
        # Update exclusion list if provided
        if exclude_fields:
            original_exclusions = self.exclude_fields.copy()
            self.exclude_fields.update(exclude_fields)
            new_exclusions = self.exclude_fields - original_exclusions
            if new_exclusions:
                self.logger.info(f"Added runtime exclusions: {sorted(list(new_exclusions))}")
                self.logger.info(f"Total excluded fields: {sorted(list(self.exclude_fields))}")
        
        # Ensure discovery is complete
        if not self.discovered_orgs:
            self.discover_orgs_and_objects(base_path)
        
        # Determine objects to compare
        objects_to_compare = sf_objects if sf_objects else self.common_objects
        
        # Filter objects that have foreign keys defined
        objects_with_foreign_keys = [obj for obj in objects_to_compare 
                                   if obj in self.foreign_key_mappings]
        objects_without_foreign_keys = [obj for obj in objects_to_compare 
                                      if obj not in self.foreign_key_mappings]
        
        if objects_without_foreign_keys:
            self.logger.warning(f"Skipping objects without foreign keys: {objects_without_foreign_keys}")
        
        if not objects_with_foreign_keys:
            return {
                "error": "No objects with foreign keys found",
                "requested_objects": objects_to_compare,
                "objects_with_foreign_keys": list(self.foreign_key_mappings.keys())
            }
        
        # Initialize summary
        overall_summary = {
            'total_objects_requested': len(objects_to_compare),
            'objects_with_foreign_keys': len(objects_with_foreign_keys),
            'objects_without_foreign_keys': len(objects_without_foreign_keys),
            'skipped_objects': objects_without_foreign_keys,
            'completed_objects': 0,
            'objects_with_differences': 0,
            'total_execution_time': 0,
            'available_orgs': self.discovered_orgs,
            'comparison_strategy': 'all_vs_all',
            'excluded_fields': sorted(list(self.exclude_fields))
        }
        
        all_object_results = {}
        
        # Process each object
        for sf_object in objects_with_foreign_keys:
            try:
                self.logger.info(f"Processing {sf_object}")
                object_start = datetime.now()
                
                object_result = self.compare_single_object_all_instances(base_path, sf_object)
                all_object_results[sf_object] = object_result
                
                if object_result.get('status') == 'completed':
                    overall_summary['completed_objects'] += 1
                    if object_result.get('summary', {}).get('comparisons_with_differences', 0) > 0:
                        overall_summary['objects_with_differences'] += 1
                
                object_time = (datetime.now() - object_start).total_seconds()
                self.logger.info(f"Completed {sf_object} in {object_time:.2f} seconds")
                
                # Memory cleanup
                gc.collect()
                
            except Exception as e:
                self.logger.error(f"Error processing {sf_object}: {e}")
                all_object_results[sf_object] = {
                    "object": sf_object,
                    "status": "error", 
                    "reason": str(e)
                }
        
        overall_summary['total_execution_time'] = (datetime.now() - start_time).total_seconds()
        
        return {
            'execution_summary': overall_summary,
            'object_results': all_object_results
        }
    
    def export_comparison_report(self, results: Dict, output_dir: str = "sf_comparison_results"):
        """Export comprehensive comparison reports with detailed field-by-field analysis."""
        try:
            os.makedirs(output_dir, exist_ok=True)
            
            # 1. Export full JSON results
            json_file = os.path.join(output_dir, "full_comparison_results.json")
            with open(json_file, 'w', encoding='utf-8') as f:
                json.dump(results, f, indent=2, default=str)
            self.logger.info(f"Exported JSON results to {json_file}")
            
            # 2. Create executive summary Excel
            self._create_executive_summary_excel(results, output_dir)
            
            # 3. Create detailed field-by-field comparison CSVs
            self._create_detailed_comparison_csvs(results, output_dir)
            
            # 4. Create field summary report
            self._create_field_summary_report(results, output_dir)
            
            self.logger.info(f"All reports exported to {output_dir}")
            
        except Exception as e:
            self.logger.error(f"Error exporting reports: {e}")
            raise
    
    def _create_executive_summary_excel(self, results: Dict, output_dir: str):
        """Create executive summary Excel file with multiple sheets."""
        excel_file = os.path.join(output_dir, "sf_comparison_summary.xlsx")
        
        with pd.ExcelWriter(excel_file, engine='openpyxl') as writer:
            # Sheet 1: Execution Summary
            exec_summary = results.get('execution_summary', {})
            exec_data = [{'Metric': key, 'Value': str(value)} for key, value in exec_summary.items()]
            
            if exec_data:
                exec_df = pd.DataFrame(exec_data)
                exec_df.to_excel(writer, sheet_name='Execution_Summary', index=False)
            
            # Sheet 2: Object Level Summary
            obj_summary = []
            for obj_name, obj_data in results.get('object_results', {}).items():
                if obj_data.get('status') == 'completed':
                    detailed_comp = obj_data.get('detailed_comparison', {})
                    obj_summary.append({
                        'Object': obj_name,
                        'Status': obj_data.get('status', 'unknown'),
                        'Total_Orgs': detailed_comp.get('total_orgs', 0),
                        'Total_Records': detailed_comp.get('total_records', 0),
                        'Total_Fields': detailed_comp.get('total_fields', 0),
                        'Fields_With_Differences': detailed_comp.get('fields_with_differences', 0),
                        'Total_Difference_Rows': detailed_comp.get('total_difference_rows', 0),
                        'Key_Field': obj_data.get('key_field', 'unknown')
                    })
                else:
                    obj_summary.append({
                        'Object': obj_name,
                        'Status': obj_data.get('status', 'unknown'),
                        'Total_Orgs': 0,
                        'Total_Records': 0,
                        'Total_Fields': 0,
                        'Fields_With_Differences': 0,
                        'Total_Difference_Rows': 0,
                        'Key_Field': obj_data.get('key_field', 'unknown')
                    })
            
            if obj_summary:
                obj_df = pd.DataFrame(obj_summary)
                obj_df.to_excel(writer, sheet_name='Object_Summary', index=False)
            
            # Sheet 3: Field-level summary across all objects
            all_field_data = []
            for obj_name, obj_data in results.get('object_results', {}).items():
                if obj_data.get('status') == 'completed' and 'detailed_comparison' in obj_data:
                    detailed_comp = obj_data['detailed_comparison']
                    for field, summary in detailed_comp.get('field_summary', {}).items():
                        all_field_data.append({
                            'Object': obj_name,
                            'Field': field,
                            'Records_With_Differences': summary['total_records_with_differences'],
                            'Total_Records': summary['total_records'],
                            'Difference_Percentage': f"{summary['difference_percentage']:.2f}%"
                        })
            
            if all_field_data:
                field_df = pd.DataFrame(all_field_data)
                field_df.to_excel(writer, sheet_name='Field_Differences', index=False)
        
        self.logger.info(f"Exported Excel summary to {excel_file}")
    
    def _create_detailed_comparison_csvs(self, results: Dict, output_dir: str):
        """Create detailed field-by-field comparison CSV files."""
        details_dir = os.path.join(output_dir, "detailed_comparisons")
        os.makedirs(details_dir, exist_ok=True)
        
        for obj_name, obj_data in results.get('object_results', {}).items():
            if obj_data.get('status') != 'completed' or 'detailed_comparison' not in obj_data:
                continue
                
            detailed_comp = obj_data['detailed_comparison']
            
            if not detailed_comp.get('detailed_rows'):
                self.logger.info(f"No differences found for {obj_name} - skipping detailed CSV")
                continue
            
            # Create main detailed comparison CSV
            csv_file = os.path.join(details_dir, f"{obj_name}_detailed_differences.csv")
            
            df_rows = detailed_comp['detailed_rows']
            if df_rows:
                df = pd.DataFrame(df_rows)
                df.to_csv(csv_file, index=False, encoding='utf-8')
                self.logger.info(f"Exported detailed differences for {obj_name}: {len(df_rows)} rows")
            
            # Create field summary CSV
            field_summary_file = os.path.join(details_dir, f"{obj_name}_field_summary.csv")
            field_summary_rows = []
            
            for field, summary in detailed_comp.get('field_summary', {}).items():
                field_summary_rows.append({
                    'Object': obj_name,
                    'Field': field,
                    'Records_With_Differences': summary['total_records_with_differences'],
                    'Total_Records': summary['total_records'],
                    'Difference_Percentage': f"{summary['difference_percentage']:.2f}%"
                })
            
            if field_summary_rows:
                field_df = pd.DataFrame(field_summary_rows)
                field_df.to_csv(field_summary_file, index=False, encoding='utf-8')
    
    def _create_field_summary_report(self, results: Dict, output_dir: str):
        """Create a comprehensive field summary report across all objects."""
        summary_file = os.path.join(output_dir, "field_summary_report.csv")
        
        all_field_summaries = []
        
        for obj_name, obj_data in results.get('object_results', {}).items():
            if obj_data.get('status') != 'completed' or 'detailed_comparison' not in obj_data:
                continue
                
            detailed_comp = obj_data['detailed_comparison']
            
            # Object-level summary
            all_field_summaries.append({
                'Object': obj_name,
                'Field': 'OBJECT_SUMMARY',
                'Total_Records': detailed_comp.get('total_records', 0),
                'Total_Fields': detailed_comp.get('total_fields', 0),
                'Fields_With_Differences': detailed_comp.get('fields_with_differences', 0),
                'Total_Difference_Rows': detailed_comp.get('total_difference_rows', 0),
                'Records_With_Differences': '',
                'Difference_Percentage': ''
            })
            
            # Field-level summaries
            for field, summary in detailed_comp.get('field_summary', {}).items():
                all_field_summaries.append({
                    'Object': obj_name,
                    'Field': field,
                    'Total_Records': summary['total_records'],
                    'Total_Fields': '',
                    'Fields_With_Differences': '',
                    'Total_Difference_Rows': '',
                    'Records_With_Differences': summary['total_records_with_differences'],
                    'Difference_Percentage': f"{summary['difference_percentage']:.2f}%"
                })
        
        if all_field_summaries:
            summary_df = pd.DataFrame(all_field_summaries)
            summary_df.to_csv(summary_file, index=False, encoding='utf-8')
            self.logger.info(f"Exported field summary report: {len(all_field_summaries)} rows")
    
    def export_detailed_differences_only(self, results: Dict, output_dir: str = "detailed_differences"):
        """Export only the detailed field-by-field differences in the user-requested format."""
        try:
            os.makedirs(output_dir, exist_ok=True)
            
            for obj_name, obj_data in results.get('object_results', {}).items():
                if obj_data.get('status') != 'completed' or 'detailed_comparison' not in obj_data:
                    continue
                    
                detailed_comp = obj_data['detailed_comparison']
                
                if not detailed_comp.get('detailed_rows'):
                    self.logger.info(f"No differences found for {obj_name}")
                    continue
                
                # Create the exact format requested by user
                csv_file = os.path.join(output_dir, f"{obj_name}_differences.csv")
                
                df_rows = detailed_comp['detailed_rows']
                
                if df_rows:
                    df = pd.DataFrame(df_rows)
                    
                    # Reorder columns to match user's preferred format
                    base_cols = ['ForeignKeyField', 'ForeignKeyValue', 'ObjectFieldName', 'DifferenceType']
                    org_cols = [col for col in df.columns if col.startswith('Org_')]
                    ordered_cols = base_cols + sorted(org_cols)
                    
                    df = df[ordered_cols]
                    df.to_csv(csv_file, index=False, encoding='utf-8')
                    
                    print(f"Exported {obj_name}: {len(df)} difference rows")
                    self.logger.info(f"Exported detailed differences for {obj_name}: {len(df)} rows")
            
            # Create a consolidated summary with exclusion information
            summary_file = os.path.join(output_dir, "differences_summary.txt")
            with open(summary_file, 'w', encoding='utf-8') as f:
                f.write("Salesforce Multi-Org Comparison Summary\n")
                f.write("=" * 50 + "\n\n")
                
                # Write exclusion information
                f.write(f"Excluded Fields ({len(self.exclude_fields)} total):\n")
                for field in sorted(self.exclude_fields):
                    f.write(f"  - {field}\n")
                f.write("\n")
                
                for obj_name, obj_data in results.get('object_results', {}).items():
                    if obj_data.get('status') == 'completed' and 'detailed_comparison' in obj_data:
                        detailed_comp = obj_data['detailed_comparison']
                        f.write(f"Object: {obj_name}\n")
                        f.write(f"  Total Records: {detailed_comp.get('total_records', 0)}\n")
                        f.write(f"  Total Fields: {detailed_comp.get('total_fields', 0)}\n")
                        f.write(f"  Fields with Differences: {detailed_comp.get('fields_with_differences', 0)}\n")
                        f.write(f"  Total Difference Rows: {detailed_comp.get('total_difference_rows', 0)}\n")
                        f.write(f"  Organizations: {', '.join(detailed_comp.get('org_list', []))}\n")
                        f.write("\n")
            
            print(f"\nDetailed differences exported to: {output_dir}")
            print(f"Excluded {len(self.exclude_fields)} fields from comparison")
            
        except Exception as e:
            self.logger.error(f"Error exporting detailed differences: {e}")
            raise


def main():
    """Main execution function."""
    parser = argparse.ArgumentParser(
        description="Compare Salesforce data across multiple organizations with detailed field analysis"
    )
    parser.add_argument('base_path', help='Base directory containing org folders and config file')
    parser.add_argument('--chunk-size', type=int, default=50000, help='Records per chunk')
    parser.add_argument('--objects', nargs='*', help='Specific objects to compare')
    parser.add_argument('--output-dir', type=str, default='sf_comparison_results', help='Output directory')
    parser.add_argument('--exclude-fields', nargs='*', 
                       help='Additional fields to exclude from comparison (e.g., --exclude-fields CustomField1__c CustomField2__c)')
    
    args = parser.parse_args()
    
    # Validate base path
    if not os.path.exists(args.base_path):
        print(f"Error: Base path does not exist: {args.base_path}", file=sys.stderr)
        sys.exit(1)
    
    try:
        # Initialize comparator with exclusions
        comparator = SalesforceDataComparator(
            chunk_size=args.chunk_size,
            exclude_fields=args.exclude_fields
        )
        
        print("Starting Salesforce Multi-Instance Data Comparison")
        print("=" * 60)
        print(f"Base path: {args.base_path}")
        
        if args.exclude_fields:
            print(f"Additional excluded fields: {args.exclude_fields}")
        
        # Discovery phase
        print("\nStep 1: Discovery...")
        discovery = comparator.discover_orgs_and_objects(args.base_path)
        
        print(f"Config loaded: {discovery['config_loaded']}")
        print(f"Found {discovery['total_orgs']} organizations")
        print(f"Found {discovery['total_common_objects']} common objects")
        
        # Comparison phase
        print("\nStep 2: Comparison...")
        full_results = comparator.compare_all_objects(
            base_path=args.base_path,
            sf_objects=args.objects
        )
        
        # Handle results
        if 'error' in full_results:
            print(f"Comparison failed: {full_results['error']}", file=sys.stderr)
            sys.exit(1)
        
        exec_summary = full_results['execution_summary']
        print(f"Comparison completed:")
        print(f"  Objects requested: {exec_summary.get('total_objects_requested', 0)}")
        print(f"  Objects with foreign keys: {exec_summary.get('objects_with_foreign_keys', 0)}")
        print(f"  Objects processed: {exec_summary.get('completed_objects', 0)}")
        print(f"  Objects with differences: {exec_summary.get('objects_with_differences', 0)}")
        print(f"  Comparison strategy: {exec_summary.get('comparison_strategy', 'all_vs_all')}")
        print(f"  Execution time: {exec_summary.get('total_execution_time', 0):.2f} seconds")
        print(f"  Excluded fields: {len(exec_summary.get('excluded_fields', []))} fields")
        
        if exec_summary.get('skipped_objects'):
            print(f"  Skipped objects (no foreign key): {exec_summary['skipped_objects']}")
        
        # Export phase
        print("\nStep 3: Export...")
        try:
            os.makedirs(args.output_dir, exist_ok=True)
            comparator.export_comparison_report(full_results, args.output_dir)
            
            # Also export detailed differences in user-preferred format
            detailed_dir = os.path.join(args.output_dir, "detailed_differences")
            comparator.export_detailed_differences_only(full_results, detailed_dir)
            
            print(f"Reports exported to '{args.output_dir}'")
            print(f"Detailed differences exported to '{detailed_dir}'")
            
            # Progress tracking for Node.js
            for obj_name, obj_data in full_results['object_results'].items():
                if obj_data.get('status') == 'completed':
                    if 'detailed_comparison' in obj_data:
                        detailed_comp = obj_data['detailed_comparison']
                        total_diff_rows = detailed_comp.get('total_difference_rows', 0)
                        fields_with_diffs = detailed_comp.get('fields_with_differences', 0)
                        print(f"  {obj_name}: {total_diff_rows} difference rows across {fields_with_diffs} fields")
                    
                    print(f"Completed comparison for {obj_name}")  # For Node.js progress tracking
                elif obj_data.get('status') == 'skipped':
                    reason = obj_data.get('reason', 'unknown reason')
                    print(f"  {obj_name}: SKIPPED - {reason}")
                elif obj_data.get('status') == 'error':
                    reason = obj_data.get('reason', 'unknown error')
                    print(f"  {obj_name}: ERROR - {reason}")
            
        except Exception as e:
            print(f"Error exporting reports: {e}", file=sys.stderr)
            sys.exit(1)
        
        print(f"\nComparison complete!")
        
    except KeyboardInterrupt:
        print(f"\nComparison interrupted", file=sys.stderr)
        sys.exit(2)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()