/**
 * Handler for `gitter init` command.
 * Prints the shell function wrapper to stdout and installation instructions to stderr.
 */
export async function initCommand(): Promise<void> {
  const shellFunction = `# Gitter shell integration
# Add this to your ~/.zshrc or ~/.bashrc, or run: eval "$(gitter init)"
gitter() {
  if [ "$1" = "go" ]; then
    shift
    local target
    target=$(command gitter go "$@")
    local exit_code=$?
    if [ $exit_code -eq 0 ] && [ -n "$target" ] && [ -d "$target" ]; then
      cd "$target" || return 1
    else
      return $exit_code
    fi
  else
    command gitter "$@"
  fi
}
`;

  const instructions = `# To enable the gitter shell function, add the following to your shell config:
#
#   For zsh:  echo 'eval "$(command gitter init)"' >> ~/.zshrc
#   For bash: echo 'eval "$(command gitter init)"' >> ~/.bashrc
#
# Then restart your shell or run:
#   source ~/.zshrc   (or source ~/.bashrc)
`;

  process.stdout.write(shellFunction);
  process.stderr.write(instructions);
}
