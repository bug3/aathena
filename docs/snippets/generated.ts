// Snippets import `./generated`, which is what a real consumer writes after
// running `aathena generate`. This shim points that path at the example
// project's committed output, so every documented example is bound to code
// the generator actually produced and CI already typechecks.
export * from '../../examples/basic/generated';
