package com.codexswitch.update

import com.codexswitch.downloads.DownloadStorage
import com.codexswitch.downloads.DownloadTask
import org.json.JSONObject
import java.io.RandomAccessFile

internal object UpdateStorageChecks {
  private const val BENCHMARK_BYTES = 32 * 1024 * 1024
  private const val SAVE_BYTES = 4 * 1024 * 1024

  fun run() {
    timedAndFinalCheckpoints()
    batchedCheckpointsAndCorruption()
    println("PASS: timed and batched durable checkpoints, close flush and corrupt-block recovery")
    benchmark()
  }

  private fun restored(files: UpdateFiles, input: JSONObject) =
    UpdateCheckpoint(files, input).use { it.restored.count { complete -> complete } }

  private fun timedAndFinalCheckpoints() = UpdateTestStorage().use { storage ->
    val input = storage.input(UPDATE_BLOCK_BYTES * 3)
    val block = ByteArray(UPDATE_BLOCK_BYTES) { (it % 251).toByte() }
    var now = 0L
    UpdateCheckpoint(storage.files, input) { now }.use { checkpoint ->
      checkpoint.write(0, block)
      check(restored(storage.files, input) == 0)
      now = 999; checkpoint.flushIfDue()
      check(restored(storage.files, input) == 0)
      now = 1_000; checkpoint.flushIfDue()
      check(restored(storage.files, input) == 1)
      checkpoint.write(1, block)
      check(restored(storage.files, input) == 1)
    }
    check(restored(storage.files, input) == 2)
  }

  private fun batchedCheckpointsAndCorruption() = UpdateTestStorage().use { storage ->
    val input = storage.input(SAVE_BYTES + UPDATE_BLOCK_BYTES)
    val block = ByteArray(UPDATE_BLOCK_BYTES) { (it % 251).toByte() }
    val batchBlocks = SAVE_BYTES / UPDATE_BLOCK_BYTES
    UpdateCheckpoint(storage.files, input) { 0 }.use { checkpoint ->
      repeat(batchBlocks - 1) { checkpoint.write(it, block) }
      check(restored(storage.files, input) == 0)
      checkpoint.write(batchBlocks - 1, block)
      check(restored(storage.files, input) == batchBlocks)
      checkpoint.write(batchBlocks, block)
      check(restored(storage.files, input) == batchBlocks)
    }
    check(restored(storage.files, input) == batchBlocks + 1)
    val partial = storage.partial(input)
    RandomAccessFile(partial, "rw").use { it.seek(UPDATE_BLOCK_BYTES.toLong()); it.writeByte(255) }
    UpdateCheckpoint(storage.files, input).use { checkpoint ->
      check(!checkpoint.restored[1] && checkpoint.restored.count { it } == batchBlocks)
    }
  }

  private fun benchmark() {
    val block = ByteArray(UPDATE_BLOCK_BYTES) { (it % 251).toByte() }
    repeat(3) { round ->
      UpdateTestStorage().use { storage ->
        val input = storage.input(BENCHMARK_BYTES)
        measure("update-checkpoints", round) {
          UpdateCheckpoint(storage.files, input).use { checkpoint ->
            repeat(BENCHMARK_BYTES / block.size) { checkpoint.write(it, block) }
          }
        }
        check(restored(storage.files, input) == BENCHMARK_BYTES / block.size)
        val manager = DownloadStorage(storage.context)
        val source = JSONObject().put("owner", "test").put("deviceId", "test")
          .put("scope", "computer").put("path", "benchmark.bin")
        val task = DownloadTask.create(source).apply { data.put("size", BENCHMARK_BYTES) }
        val half = block.size / 2
        val chunks = listOf(block.copyOfRange(0, half), block.copyOfRange(half, block.size))
        measure("download-manager-storage", round) {
          manager.prepare(task)
          repeat(BENCHMARK_BYTES / block.size) {
            chunks.forEach { chunk -> manager.append(task, chunk) }
            if (task.received % SAVE_BYTES == 0L) manager.save(listOf(task))
          }
          manager.save(listOf(task))
        }
        check(manager.load().getValue(task.id).received == BENCHMARK_BYTES.toLong())
      }
    }
  }

  private fun measure(name: String, round: Int, action: () -> Unit) {
    val started = System.nanoTime()
    action()
    val seconds = (System.nanoTime() - started) / 1_000_000_000.0
    println(JSONObject().put("stage", name).put("round", round + 1).put("bytes", BENCHMARK_BYTES)
      .put("ms", seconds * 1_000).put("MiBps", BENCHMARK_BYTES / seconds / 1024 / 1024))
  }

}
