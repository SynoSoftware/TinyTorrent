using System.Collections;

namespace TinyTorrent;

public readonly record struct SpeedSample(TimeSpan Time, double Download, double Upload, bool StartsSegment);

/// <summary>
/// A bounded active-speed ring. Only the observed inspector retains timestamped samples for
/// both transfer directions.
/// </summary>
public sealed class SpeedHistoryBuffer : IReadOnlyList<double>
{
    private readonly double[] _samples;
    private int _next;
    private int _count;
    private double? _peak;
    private TransferHistory? _transfers;

    public SpeedHistoryBuffer(int capacity) => _samples = new double[capacity];

    public int Count => _count;

    public IReadOnlyList<SpeedSample>? Transfers => _transfers;

    /// <summary>The largest sample present. Zero when the ring is still empty.</summary>
    /// <remarks>
    /// A dropped peak has to be rescanned rather than folded in, otherwise the sparkline stays
    /// scaled to a spike that has already left the window. The rescan runs when the value is read
    /// and not when a sample arrives, because only a realized sparkline ever reads it: a 2,000-row
    /// list records 2,000 samples a tick, so scanning on push cost 32 comparisons for each of them.
    /// </remarks>
    public double Peak
    {
        get
        {
            if (_peak is double known)
            {
                return known;
            }

            double peak = 0;
            for (int index = 0; index < Count; index++)
            {
                double sample = this[index];
                if (sample > peak)
                {
                    peak = sample;
                }
            }

            _peak = peak;
            return peak;
        }
    }

    public double this[int index] => _samples[Position(index, _count)];

    public void Push(double sample)
    {
        StopObserving();
        _samples[_next] = sample;
        Advance();
    }

    internal void Push(TimeSpan time, double download, double upload, bool uploading, bool observe)
    {
        _samples[_next] = uploading ? upload : download;
        if (observe)
        {
            _transfers ??= new TransferHistory(_samples.Length);
            _transfers.Push(time, download, upload);
        }
        else
        {
            StopObserving();
        }

        Advance();
    }

    internal void StopObserving()
    {
        _transfers?.Release();
        _transfers = null;
    }

    private void Advance()
    {
        _next = (_next + 1) % _samples.Length;
        _count = Math.Min(_count + 1, _samples.Length);
        _peak = null;
    }

    private int Position(int index, int count)
    {
        ArgumentOutOfRangeException.ThrowIfNegative(index);
        ArgumentOutOfRangeException.ThrowIfGreaterThanOrEqual(index, count);
        return (_next - count + index + _samples.Length) % _samples.Length;
    }

    public IEnumerator<double> GetEnumerator()
    {
        for (int i = 0; i < Count; i++)
        {
            yield return this[i];
        }
    }

    IEnumerator IEnumerable.GetEnumerator() => GetEnumerator();

    private sealed class TransferHistory(int capacity) : IReadOnlyList<SpeedSample>
    {
        private SpeedSample[]? _samples = new SpeedSample[capacity];
        private int _next;

        public int Count { get; private set; }

        public SpeedSample this[int index]
        {
            get
            {
                ArgumentOutOfRangeException.ThrowIfNegative(index);
                ArgumentOutOfRangeException.ThrowIfGreaterThanOrEqual(index, Count);
                return _samples![(_next - Count + index + capacity) % capacity];
            }
        }

        internal void Push(TimeSpan time, double download, double upload)
        {
            TimeSpan elapsed = Count == 0 ? TimeSpan.Zero : time - this[Count - 1].Time;
            bool startsSegment = Count == 0 || elapsed <= TimeSpan.Zero || elapsed >= Tick.Interval * 2;
            _samples![_next] = new SpeedSample(time, download, upload, startsSegment);
            _next = (_next + 1) % capacity;
            Count = Math.Min(Count + 1, capacity);
        }

        internal void Release()
        {
            Count = 0;
            _samples = null;
        }

        public IEnumerator<SpeedSample> GetEnumerator()
        {
            for (int index = 0; index < Count; index++)
            {
                yield return this[index];
            }
        }

        IEnumerator IEnumerable.GetEnumerator() => GetEnumerator();
    }
}
