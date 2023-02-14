curl -fsSL https://deno.land/x/install/install.sh | sh
export DENO_INSTALL="/home/codespace/.deno"
export PATH="$DENO_INSTALL/bin:$PATH"
alias deno=/home/codespace/.deno/bin/deno
echo "export DENO_INSTALL=\"/home/codespace/.deno\"" >> ~/.bashrc
echo "export PATH=\"$DENO_INSTALL/bin:$PATH\"" >> ~/.bashrc