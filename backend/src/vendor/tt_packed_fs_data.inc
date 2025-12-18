asm(R"asm(
.section .rodata
.align 16
.global tt_packed_fs_blob
tt_packed_fs_blob:
.incbin "tt_packed_fs.bin"
.global tt_packed_fs_blob_end
tt_packed_fs_blob_end:
)asm");
