!/bin/bash

BASE_DIR="/home/labcabrera/repositories/github/rmu"

run_tab () {
  gnome-terminal --tab -- bash -c "cd $1 && $2; exec bash"
}

run_tab ${BASE_DIR}/rmu-mfe-shell "npm run start:live"
run_tab ${BASE_DIR}/rmu-mfe-core "npm run start:live"
run_tab ${BASE_DIR}/rmu-mfe-strategic "npm run start:live"
run_tab ${BASE_DIR}/rmu-mfe-tactical "npm run start:live"
run_tab ${BASE_DIR}/rmu-mfe-items "npm run start:live"
run_tab ${BASE_DIR}/rmu-mfe-assets "python3 local-start.py"
