mkdir temp_dir
robocopy temp_dir node_modules /s /mir
rmdir temp_dir
rmdir node_modules