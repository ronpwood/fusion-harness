#!/bin/bash
# make-fixtures.sh — regenerates fixtures/*.json for test.sh. Fixture cwd is filled in
# at test time by test.sh so lease hashing matches the real project path.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p fixtures
mk() { jq -n --arg tool "$2" --argjson ti "$3" '{session_id:"fixture",cwd:"/placeholder",permission_mode:"default",hook_event_name:"PreToolUse",tool_name:$tool,tool_input:$ti}' > "fixtures/$1.json"; }
E='.env'
mk read-env Read "{\"file_path\":\"/Users/x/fusion-harness/$E\"}"
mk read-env-local Read "{\"file_path\":\"$E.local\"}"
mk read-env-example Read "{\"file_path\":\"$E.example\"}"
mk read-src Read '{"file_path":"extensions/fusion-harness/modules/runtime.ts"}'
mk grep-pi-dir Grep '{"pattern":"model","path":"/Users/x/.pi/agent"}'
mk glob-pem Glob '{"pattern":"**/*.pem"}'
mk bash-cat-env Bash "{\"command\":\"cat $E | head\"}"
mk bash-source-env Bash "{\"command\":\"set -a; source $E; set +a; npm test\"}"
mk bash-printenv Bash '{"command":"printenv | sort"}'
mk bash-env-prefix Bash '{"command":"env FOO=bar npm test"}'
mk bash-env-prose Bash '{"command":"cat <<EOF > x.md\nthe session env or printenv dumps\nEOF"}'
mk bash-env-pipe Bash '{"command":"cd /x && env | grep -i key"}'
mk bash-ls Bash '{"command":"ls -la prompts/function-hooks"}'
mk bash-rm-rf-root Bash '{"command":"rm -rf /"}'
mk bash-rm-rf-ext Bash '{"command":"cd tmp && rm -rf ../extensions"}'
mk bash-rm-rf-lab Bash '{"command":"rm -rf hooks20_fusion_lab"}'
mk bash-rm-file Bash '{"command":"rm hooks20_fusion_lab/run.sh"}'
mk bash-git-force Bash '{"command":"git push --force origin main"}'
mk bash-git-reset Bash '{"command":"FOO=1 git reset --hard HEAD~1"}'
mk bash-git-clean Bash '{"command":"git clean -fdx"}'
mk bash-git-status Bash '{"command":"git status --short && git log -3"}'
mk write-src Write '{"file_path":"extensions/fusion-harness/modules/x.ts","content":"x"}'
mk bash-redirect Bash '{"command":"echo hi > out.txt"}'
jq -n '{hook_event_name:"PostToolUse",tool_name:"Bash",tool_input:{command:"echo"},tool_response:{stdout:"key is sk-fixture-SECRET-VALUE-0123456789 ok",stderr:"",interrupted:false,isImage:false}}' > fixtures/post-bash-secret.json
jq -n '{hook_event_name:"PostToolUse",tool_name:"Bash",tool_input:{command:"echo"},tool_response:{stdout:"nothing here",stderr:"",interrupted:false,isImage:false}}' > fixtures/post-bash-clean.json
echo "fixtures written: $(ls fixtures | wc -l | tr -d ' ')"
